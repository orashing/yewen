#!/usr/bin/env python3
"""Content OS Mac publisher worker.

Uses the normal authenticated Supabase user (not service-role) to atomically claim jobs,
then drives the dedicated Xiaohongshu publisher Chromium profile. It fails closed on
CAPTCHA, UI changes, or unverified final publish state.
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import time
from pathlib import Path

import httpx
from playwright.sync_api import sync_playwright

from xhs_native_publisher import publish_native_text


class SupabaseUserClient:
    def __init__(self, url: str, anon_key: str, email: str, password: str):
        self.url=url.rstrip('/');self.anon=anon_key;self.email=email;self.password=password
        self.access='';self.refresh='';self.expires_at=0.0
        self.http=httpx.Client(timeout=20)

    def close(self): self.http.close()

    def _auth_headers(self):
        self.ensure_auth()
        return {'apikey':self.anon,'Authorization':f'Bearer {self.access}','Content-Type':'application/json'}

    def login(self):
        r=self.http.post(f'{self.url}/auth/v1/token?grant_type=password',headers={'apikey':self.anon,'Content-Type':'application/json'},json={'email':self.email,'password':self.password})
        r.raise_for_status();d=r.json();self.access=d['access_token'];self.refresh=d['refresh_token'];self.expires_at=time.time()+int(d.get('expires_in') or 3600)-90

    def refresh_session(self):
        if not self.refresh:return self.login()
        r=self.http.post(f'{self.url}/auth/v1/token?grant_type=refresh_token',headers={'apikey':self.anon,'Content-Type':'application/json'},json={'refresh_token':self.refresh})
        if r.status_code>=400:return self.login()
        d=r.json();self.access=d['access_token'];self.refresh=d.get('refresh_token',self.refresh);self.expires_at=time.time()+int(d.get('expires_in') or 3600)-90

    def ensure_auth(self):
        if not self.access:self.login()
        elif time.time()>=self.expires_at:self.refresh_session()

    def rpc(self, name: str, payload: dict | None=None):
        r=self.http.post(f'{self.url}/rest/v1/rpc/{name}',headers=self._auth_headers(),json=payload or {})
        if r.status_code==401:
            self.login();r=self.http.post(f'{self.url}/rest/v1/rpc/{name}',headers=self._auth_headers(),json=payload or {})
        r.raise_for_status()
        if not r.content:return None
        return r.json()


def screenshot(page, job_id: str, folder: Path) -> str:
    folder.mkdir(parents=True,exist_ok=True)
    path=folder/f'{job_id}-{int(time.time())}.png'
    try:page.screenshot(path=str(path),full_page=True)
    except Exception:return ''
    return str(path)


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--profile-dir',default=str(Path.home()/'.content-os'/'xhs-publisher-profile'))
    ap.add_argument('--screenshots',default=str(Path.home()/'.content-os'/'screenshots'))
    ap.add_argument('--poll-seconds',type=int,default=20)
    ap.add_argument('--auto-publish',action='store_true')
    ap.add_argument('--once',action='store_true')
    args=ap.parse_args()

    required=['SUPABASE_URL','SUPABASE_ANON_KEY','CONTENT_OS_EMAIL','CONTENT_OS_PASSWORD']
    missing=[k for k in required if not os.getenv(k)]
    if missing:raise SystemExit('Missing env: '+','.join(missing))

    worker_id=f'{socket.gethostname()}-{os.getpid()}'
    client=SupabaseUserClient(os.environ['SUPABASE_URL'],os.environ['SUPABASE_ANON_KEY'],os.environ['CONTENT_OS_EMAIL'],os.environ['CONTENT_OS_PASSWORD'])
    profile=Path(args.profile_dir).expanduser();profile.mkdir(parents=True,exist_ok=True)
    shots=Path(args.screenshots).expanduser()

    try:
      with sync_playwright() as pw:
        context=pw.chromium.launch_persistent_context(user_data_dir=str(profile),headless=False,viewport={'width':1440,'height':1000})
        page=context.pages[0] if context.pages else context.new_page()
        while True:
            try:client.rpc('requeue_expired_publish_jobs_v09',{})
            except Exception as exc:print('requeue warning:',exc,flush=True)
            try:
                job=client.rpc('claim_publish_job_v09',{'p_worker_id':worker_id,'p_lease_minutes':10})
            except Exception as exc:
                print('claim failed:',exc,flush=True);time.sleep(max(5,args.poll_seconds));continue
            if not job:
                if args.once:break
                time.sleep(max(5,args.poll_seconds));continue

            job_id=job['id'];payload=job.get('payload') or {};plan=payload.get('native_text_plan') or {}
            if job.get('account_role') != 'publisher':
                try:client.rpc('finish_publish_job_v09',{'p_job_id':job_id,'p_worker_id':worker_id,'p_status':'CANCELLED','p_result':{},'p_error_code':'WRONG_ACCOUNT_ROLE','p_error_detail':'Publisher worker refuses non-publisher jobs'})
                except Exception as finish_exc:print('finish failed:',finish_exc,flush=True)
                if args.once:break
                continue
            try:
                result=publish_native_text(page,plan,auto_publish=args.auto_publish)
                if result['status']=='PUBLISHED_CONFIRMED':
                    client.rpc('finish_publish_job_v09',{'p_job_id':job_id,'p_worker_id':worker_id,'p_status':'PUBLISHED','p_result':result})
                elif result['status']=='READY_FOR_FINAL_CLICK':
                    client.rpc('finish_publish_job_v09',{'p_job_id':job_id,'p_worker_id':worker_id,'p_status':'NEED_HUMAN','p_result':result,'p_error_code':'FINAL_CLICK_DISABLED','p_error_detail':'Worker is running without --auto-publish'})
                else:
                    shot=screenshot(page,job_id,shots);result['screenshot']=shot
                    client.rpc('finish_publish_job_v09',{'p_job_id':job_id,'p_worker_id':worker_id,'p_status':'NEED_HUMAN','p_result':result,'p_error_code':'UNVERIFIED_PUBLISH','p_error_detail':'Publish click was not followed by a recognized success state'})
            except Exception as exc:
                shot=screenshot(page,job_id,shots)
                code='NEED_HUMAN_VERIFICATION' if 'NEED_HUMAN_VERIFICATION' in str(exc) else 'PUBLISHER_ERROR'
                status='NEED_HUMAN' if code=='NEED_HUMAN_VERIFICATION' or 'UI_ELEMENT_NOT_FOUND' in str(exc) else 'FAILED'
                try:client.rpc('finish_publish_job_v09',{'p_job_id':job_id,'p_worker_id':worker_id,'p_status':status,'p_result':{'screenshot':shot},'p_error_code':code,'p_error_detail':str(exc)[:1500]})
                except Exception as finish_exc:print('finish failed:',finish_exc,flush=True)
            if args.once:break
        context.close()
    finally:client.close()


if __name__=='__main__':main()
