#!/usr/bin/env python3
"""Low-frequency Xiaohongshu research-account collector.

This reads one visible search-results page per query using a dedicated persistent browser
profile. It does not auto-scroll, like/comment/follow/message, bypass verification, or call
private APIs. UI selectors are deliberately fail-closed and must be calibrated on the
user's own research account if Xiaohongshu changes the web UI.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import httpx
from playwright.sync_api import Page, sync_playwright

XHS_HOME='https://www.xiaohongshu.com/'


def visible_text(page: Page, texts: list[str]) -> str|None:
    for text in texts:
        try:
            loc=page.get_by_text(text,exact=False)
            if loc.count() and loc.first.is_visible(timeout=500):return text
        except Exception:pass
    return None


def assert_no_verification(page: Page):
    hit=visible_text(page,['验证码','安全验证','滑块','请完成验证','登录验证','异常访问'])
    if hit:raise RuntimeError(f'NEED_HUMAN_VERIFICATION:{hit}')


def search_box(page: Page):
    for sel in ["input[placeholder*='搜索']","input[type='search']","input.search-input"]:
        try:
            loc=page.locator(sel)
            if loc.count() and loc.first.is_visible(timeout=700):return loc.first
        except Exception:pass
    raise RuntimeError('SEARCH_INPUT_NOT_FOUND')


def collect_query(page: Page, query: str, max_results: int=12) -> list[dict]:
    page.goto(XHS_HOME,wait_until='domcontentloaded');page.wait_for_timeout(1400);assert_no_verification(page)
    box=search_box(page);box.fill(query);box.press('Enter');page.wait_for_timeout(2500);assert_no_verification(page)
    out=[];seen=set()
    anchors=page.locator("a[href*='/explore/']")
    for i in range(min(anchors.count(), max_results*4)):
        try:
            a=anchors.nth(i)
            if not a.is_visible(timeout=200):continue
            href=a.get_attribute('href') or ''
            if not href or href in seen:continue
            seen.add(href)
            text=(a.inner_text(timeout=800) or '').strip()
            if len(text)<2:
                try:text=(a.locator('xpath=..').inner_text(timeout=500) or '').strip()
                except Exception:pass
            lines=[x.strip() for x in text.splitlines() if x.strip()]
            if not lines:continue
            title=max(lines[:4],key=len)[:120]
            out.append({
                'title':title,'query':query,'summary':' / '.join(lines[:5])[:350],
                'platform':'xiaohongshu','surface':'search','freshness':5,'search_intent':7,
                'engagement_signal':5,'audience_fit':7,'conversion_fit':7,'confidence':0.65,
                'observed_at':datetime.now(timezone.utc).isoformat(),'metrics':{},
                'source':{'platform':'xiaohongshu','surface':'search','title':title,'url':urljoin(XHS_HOME,href),'publisher':'小红书公开搜索结果'},
                'raw':{'visible_text':' / '.join(lines[:8])[:700]},'status':'active',
            })
            if len(out)>=max_results:break
        except Exception:continue
    return out


class SyncClient:
    def __init__(self,url,anon,email,password):
        self.url=url.rstrip('/');self.anon=anon;self.email=email;self.password=password;self.http=httpx.Client(timeout=20);self.token=''
    def login(self):
        r=self.http.post(f'{self.url}/auth/v1/token?grant_type=password',headers={'apikey':self.anon,'Content-Type':'application/json'},json={'email':self.email,'password':self.password});r.raise_for_status();self.token=r.json()['access_token']
    def insert_signals(self,signals):
        if not self.token:self.login()
        headers={'apikey':self.anon,'Authorization':f'Bearer {self.token}','Content-Type':'application/json','Prefer':'return=minimal'}
        rows=[{k:v for k,v in x.items() if k in {'title','query','summary','platform','surface','freshness','search_intent','engagement_signal','audience_fit','conversion_fit','confidence','observed_at','metrics','source','raw','status'}} for x in signals]
        r=self.http.post(f'{self.url}/rest/v1/trend_signals',headers=headers,json=rows);r.raise_for_status()
    def close(self):self.http.close()


def main():
    ap=argparse.ArgumentParser();ap.add_argument('queries',nargs='+');ap.add_argument('--profile-dir',default=str(Path.home()/'.content-os'/'xhs-research-profile'));ap.add_argument('--max-results',type=int,default=10);ap.add_argument('--delay-seconds',type=int,default=12);ap.add_argument('--output',default=str(Path.home()/'.content-os'/'research-signals.json'));ap.add_argument('--sync-supabase',action='store_true');args=ap.parse_args()
    queries=[q.strip() for q in args.queries if q.strip()][:10]
    if not queries:raise SystemExit('No queries')
    profile=Path(args.profile_dir).expanduser();profile.mkdir(parents=True,exist_ok=True)
    all_signals=[]
    with sync_playwright() as pw:
        ctx=pw.chromium.launch_persistent_context(user_data_dir=str(profile),headless=False,viewport={'width':1440,'height':1000});page=ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            for idx,q in enumerate(queries):
                rows=collect_query(page,q,max(1,min(20,args.max_results)));all_signals.extend(rows);print(f'{q}: {len(rows)}',flush=True)
                if idx<len(queries)-1:time.sleep(max(5,args.delay_seconds))
        finally:ctx.close()
    # Deduplicate links, keeping query context from first observation.
    dedup={};
    for x in all_signals:dedup.setdefault((x.get('source') or {}).get('url') or f"{x['query']}::{x['title']}",x)
    signals=list(dedup.values())
    output=Path(args.output).expanduser();output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps({'signals':signals,'xhs_direct':True,'collected_at':datetime.now(timezone.utc).isoformat()},ensure_ascii=False,indent=2),encoding='utf-8')
    if args.sync_supabase:
        required=['SUPABASE_URL','SUPABASE_ANON_KEY','CONTENT_OS_EMAIL','CONTENT_OS_PASSWORD'];missing=[k for k in required if not os.getenv(k)]
        if missing:raise SystemExit('Missing sync env: '+','.join(missing))
        c=SyncClient(os.environ['SUPABASE_URL'],os.environ['SUPABASE_ANON_KEY'],os.environ['CONTENT_OS_EMAIL'],os.environ['CONTENT_OS_PASSWORD'])
        try:c.insert_signals(signals)
        finally:c.close()
    print(json.dumps({'signals':len(signals),'output':str(output),'synced':bool(args.sync_supabase)},ensure_ascii=False))


if __name__=='__main__':main()
