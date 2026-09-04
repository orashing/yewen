#!/usr/bin/env python3
"""Fail-safe Xiaohongshu native text-to-image publisher scaffold.

Designed for a user's own publisher account. It uses a dedicated persistent Chromium
profile and only clicks the normal creator UI. It deliberately does NOT attempt to
bypass CAPTCHAs, login verification, rate limits, or private APIs.

Current UI sequence is based on publicly described creator workflows and must be
verified on the user's own account before enabling --auto-publish.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable

from playwright.sync_api import Page, sync_playwright, TimeoutError as PlaywrightTimeoutError

CREATOR_URL = "https://creator.xiaohongshu.com"


def _visible_text(page: Page, texts: Iterable[str]) -> str | None:
    for text in texts:
        loc = page.get_by_text(text, exact=False)
        try:
            if loc.first.is_visible(timeout=800):
                return text
        except Exception:
            pass
    return None


def assert_no_verification(page: Page) -> None:
    hit = _visible_text(page, ["验证码", "安全验证", "滑块", "请完成验证", "登录验证", "异常"])
    if hit:
        raise RuntimeError(f"NEED_HUMAN_VERIFICATION:{hit}")


def click_text(page: Page, labels: list[str], timeout: int = 8000) -> str:
    for label in labels:
        try:
            loc = page.get_by_text(label, exact=True)
            if loc.count() and loc.first.is_visible(timeout=800):
                loc.first.click(timeout=timeout)
                return label
        except Exception:
            continue
    raise RuntimeError(f"UI_ELEMENT_NOT_FOUND:{'/'.join(labels)}")


def fill_first_textarea(page: Page, text: str) -> None:
    candidates = [page.locator("textarea"), page.locator("[contenteditable='true']")]
    for loc in candidates:
        try:
            if loc.count() and loc.first.is_visible(timeout=1200):
                loc.first.click()
                if loc.first.evaluate("el => el.tagName.toLowerCase()") == "textarea":
                    loc.first.fill(text)
                else:
                    loc.first.press("ControlOrMeta+A")
                    loc.first.fill(text)
                return
        except Exception:
            continue
    raise RuntimeError("TEXT_INPUT_NOT_FOUND")


def choose_style(page: Page, preferred: str, fallbacks: list[str]) -> str:
    for name in [preferred, *fallbacks, "简约", "备忘", "基础"]:
        try:
            loc = page.get_by_text(name, exact=True)
            if loc.count() and loc.first.is_visible(timeout=800):
                loc.first.click()
                return name
        except Exception:
            continue
    raise RuntimeError("TEXT_TO_IMAGE_STYLE_NOT_FOUND")


def fill_title_if_present(page: Page, title: str) -> bool:
    selectors = [
        "input[placeholder*='标题']",
        "input[placeholder*='填写标题']",
        "input[placeholder*='添加标题']",
    ]
    for sel in selectors:
        try:
            loc = page.locator(sel)
            if loc.count() and loc.first.is_visible(timeout=800):
                loc.first.fill(title)
                return True
        except Exception:
            continue
    return False


def publish_native_text(page: Page, package: dict, auto_publish: bool = False) -> dict:
    title = str(package.get("title") or "").strip()
    text = str(package.get("input_text") or "").strip()
    preferred = str(package.get("recommended_style") or "简约")
    fallbacks = [str(x) for x in package.get("fallback_styles") or ["备忘", "基础"]]
    if not text:
        raise ValueError("native_text_plan.input_text is empty")

    page.goto(CREATOR_URL, wait_until="domcontentloaded")
    page.wait_for_timeout(1800)
    assert_no_verification(page)

    # The exact creator UI is subject to A/B tests. Use visible labels first and fail closed.
    click_text(page, ["发布笔记", "发布"])
    page.wait_for_timeout(1000)
    assert_no_verification(page)
    click_text(page, ["上传图文", "图文"])
    page.wait_for_timeout(600)
    click_text(page, ["文字配图", "文字"])
    page.wait_for_timeout(600)

    fill_first_textarea(page, text)
    click_text(page, ["生成图片", "生成配图"])
    page.wait_for_timeout(2200)
    assert_no_verification(page)

    style = choose_style(page, preferred, fallbacks)
    click_text(page, ["下一步", "确认"])
    page.wait_for_timeout(1200)
    fill_title_if_present(page, title)
    assert_no_verification(page)

    if not auto_publish:
        return {"status": "READY_FOR_FINAL_CLICK", "selected_style": style, "title": title}

    click_text(page, ["发布", "发布笔记"])
    # Do not claim success merely because a button was clicked. Wait for an explicit UI signal.
    deadline_ms = 10000
    elapsed = 0
    while elapsed < deadline_ms:
        page.wait_for_timeout(500)
        elapsed += 500
        assert_no_verification(page)
        hit = _visible_text(page, ["发布成功", "发布完成", "已发布"])
        if hit:
            return {"status": "PUBLISHED_CONFIRMED", "selected_style": style, "title": title, "confirmation": hit, "url": page.url}
        # Creator Center may show a moderation/pending state after successful submission.
        pending = _visible_text(page, ["审核中", "等待审核"])
        if pending:
            return {"status": "PUBLISHED_CONFIRMED", "selected_style": style, "title": title, "confirmation": pending, "url": page.url}
    return {"status": "PUBLISH_CLICKED_UNVERIFIED", "selected_style": style, "title": title, "url": page.url}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("package", help="JSON file containing native_text_plan")
    ap.add_argument("--profile-dir", default=str(Path.home()/".content-os"/"xhs-publisher-profile"))
    ap.add_argument("--auto-publish", action="store_true", help="Click final Publish after the Content OS review gate")
    args = ap.parse_args()

    package = json.loads(Path(args.package).read_text(encoding="utf-8"))
    if "native_text_plan" in package:
        package = package["native_text_plan"]

    profile = Path(args.profile_dir).expanduser()
    profile.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        context = pw.chromium.launch_persistent_context(
            user_data_dir=str(profile),
            headless=False,
            viewport={"width": 1440, "height": 1000},
        )
        page = context.pages[0] if context.pages else context.new_page()
        try:
            result = publish_native_text(page, package, auto_publish=args.auto_publish)
            print(json.dumps(result, ensure_ascii=False))
        except PlaywrightTimeoutError as exc:
            raise SystemExit(f"PAGE_TIMEOUT:{exc}")
        finally:
            context.close()


if __name__ == "__main__":
    main()
