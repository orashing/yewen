import React, {useEffect, useState} from 'react'
import {createRoot} from 'react-dom/client'
import './styles.css'

import {factCheck as runFactCheck, generateBrief, generateCardPlan, generateDraft, getHealth, getAiPolicy, planCalendar, repurposeContent, scanTopicRadar, suggestTopics, sweepTrendSignals, runEditorialDirector, reviewEditorial, buildXhsNativeTextPlan, runAutopilot, getReady, getAiUsage} from './lib/api'
import {
  approveContent,
  createTopic,
  deleteOpinion,
  getContent,
  listCalendarItems,
  listContents,
  listOpinions,
  listTopics,
  listVersions,
  saveCardPlan,
  saveContent,
  saveFactCheck,
  saveOpinion,
  replaceCalendarItems,
  updateCalendarItem,
  deleteCalendarItem,
  uploadCardBlobs,
  listKnowledgeItems, saveKnowledgeItem, deleteKnowledgeItem,
  listLeads, saveLead, deleteLead,
  listRepurposedOutputs, saveRepurposedOutputs,
  listBridgeRuns, saveBridgeRun, getPreferences, savePreferences,
  listRadarSources, updateRadarSource, listWatchQueries, saveWatchQuery, deleteWatchQuery, saveTrendSignals, listTrendSignals,
  listXhsAccounts, saveXhsAccount, listResearchRuns, saveResearchRun, listPosts, savePost, listMetrics, saveMetric,
  saveEditorialReview, saveNativeTextPlan, queuePublishJob,
} from './lib/db'
import {registerPwa} from './lib/pwa'
import {downloadBlob, renderPlanToBlobs} from './lib/cardRenderer'
import {supabase, supabaseConfigured} from './lib/supabase'
import {buildDailyBridgePrompt, buildTrendBridgePrompt, extractJson, normalizeDailyPackage, normalizeTrendSweep} from './lib/aiBridge'

registerPwa()


class AppErrorBoundary extends React.Component {
  constructor(props){super(props);this.state={error:null}}
  static getDerivedStateFromError(error){return {error}}
  componentDidCatch(error,info){console.error('Content OS UI crashed',error,info)}
  render(){
    if(!this.state.error)return this.props.children
    return <main className="centered"><section className="panel"><div className="step">界面发生异常</div><h2>数据没有被自动提交。</h2><p className="muted">请刷新页面重试。如果刚刚在做发布/审核动作，先检查 Content OS 状态，不要重复点击。</p><pre className="errorBox">{String(this.state.error?.message||this.state.error)}</pre><button className="primary" onClick={()=>window.location.reload()}>刷新页面</button></section></main>
  }
}

const blankBrief = {
  target_audience:'', purpose:'decision', content_type:'', core_conflict:'', thesis:'',
  reader_takeaway:'', creator_angle:'', outline:[], facts_to_verify:[], risk_flags:[],
}
const blankOpinion = {title:'', viewpoint:'', reasoning:'', exceptions:'', tone_note:'', tags:[], is_pinned:false}
const blankKnowledge = {kind:'case',title:'',summary:'',content:'',tags:[],is_sensitive:false,metadata:{}}
const blankLead = {source_post_id:'',name_alias:'',stage:'new',city:'北京',district:'',grade:'',score_range:'',need:'',contact_channel:'',contact_note:'',source_channel:'xiaohongshu',source_note:'',estimated_value:0,actual_value:0,next_action:'',next_followup_date:''}

const DEFAULT_EDITORIAL_STYLE = `升学决策·克制判断型：结论先行但必须有边界；具体、克制、像真实咨询；少营销腔、少职场吐槽腔；不要首先其次最后式模板；不替家庭做最终决定；优先讲学校/专业/城市/保研/就业/家庭资源之间的交换关系。`


function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(supabaseConfigured)

  useEffect(()=>{
    if (!supabaseConfigured) { setAuthLoading(false); return }
    supabase.auth.getSession().then(({data})=>{ setSession(data.session); setAuthLoading(false) })
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,next)=>setSession(next))
    return ()=>subscription.unsubscribe()
  },[])

  if (authLoading) return <Centered>正在连接 Content OS…</Centered>
  if (supabaseConfigured && !session) return <AuthScreen />
  return <Workspace session={session} />
}

function AuthScreen() {
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState(false)

  async function magicLink(){
    if(!email) return
    setBusy(true); setMessage('')
    const {error}=await supabase.auth.signInWithOtp({email, options:{emailRedirectTo:window.location.origin}})
    setBusy(false); setMessage(error ? `发送失败：${error.message}` : '登录链接已发送到邮箱。')
  }
  async function passwordLogin(){
    if(!email || !password) return
    setBusy(true); setMessage('')
    const {error}=await supabase.auth.signInWithPassword({email,password})
    setBusy(false); if(error) setMessage(`登录失败：${error.message}`)
  }

  return <Centered>
    <div className="authCard">
      <div className="brandMark">O</div>
      <div className="eyebrow">CONTENT OS · V0.9</div>
      <h1>你的内容工作台</h1>
      <p className="muted">登录后，选题、观点和草稿会在手机与电脑之间同步。</p>
      <label>邮箱</label>
      <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" />
      <button className="primary wide" disabled={busy||!email} onClick={magicLink}>{busy?'处理中…':'发送 Magic Link'}</button>
      <div className="divider"><span>或密码登录</span></div>
      <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="密码" />
      <button className="ghost wide" disabled={busy||!email||!password} onClick={passwordLogin}>密码登录</button>
      {message && <div className="inlineMessage">{message}</div>}
    </div>
  </Centered>
}

function Workspace({session}) {
  const [tab,setTab]=useState('home')
  const [mode,setMode]=useState('checking')
  const [topics,setTopics]=useState([])
  const [contents,setContents]=useState([])
  const [opinions,setOpinions]=useState([])
  const [calendarItems,setCalendarItems]=useState([])
  const [knowledge,setKnowledge]=useState([])
  const [leads,setLeads]=useState([])
  const [bridgeRuns,setBridgeRuns]=useState([])
  const [radarSources,setRadarSources]=useState([])
  const [watchQueries,setWatchQueries]=useState([])
  const [trendSignals,setTrendSignals]=useState([])
  const [xhsAccounts,setXhsAccounts]=useState([])
  const [researchRuns,setResearchRuns]=useState([])
  const [posts,setPosts]=useState([])
  const [metrics,setMetrics]=useState([])
  const [aiPolicy,setAiPolicy]=useState(null)
  const [preferences,setPreferences]=useState({ai_mode:'manual',config:{}})
  const [activeTopic,setActiveTopic]=useState(null)
  const [activeContentId,setActiveContentId]=useState(null)
  const [brief,setBrief]=useState(null)
  const [draft,setDraft]=useState(null)
  const [selectedTitle,setSelectedTitle]=useState(0)
  const [versions,setVersions]=useState([])
  const [factCheck,setFactCheck]=useState(null)
  const [cardPlan,setCardPlan]=useState(null)
  const [editorialReview,setEditorialReview]=useState(null)
  const [nativeTextPlan,setNativeTextPlan]=useState(null)
  const [toast,setToast]=useState('')
  const [loading,setLoading]=useState(true)

  async function refresh(){
    setLoading(true)
    try {
      const [t,c,o,cal,k,l,b,rs,wq,ts,xa,rr,ps,ms,prefs] = await Promise.all([listTopics(),listContents(),listOpinions(),listCalendarItems(),listKnowledgeItems(),listLeads(),listBridgeRuns(),listRadarSources(),listWatchQueries(),listTrendSignals(),listXhsAccounts(),listResearchRuns(),listPosts(),listMetrics(),getPreferences()])
      setTopics(t); setContents(c); setOpinions(o); setCalendarItems(cal); setKnowledge(k); setLeads(l); setBridgeRuns(b); setRadarSources(rs); setWatchQueries(wq); setTrendSignals(ts); setXhsAccounts(xa); setResearchRuns(rr); setPosts(ps); setMetrics(ms); setPreferences(prefs||{ai_mode:'manual',config:{}})
    } catch(e) { setToast(`读取云端数据失败：${e.message}`) }
    finally { setLoading(false) }
  }

  useEffect(()=>{
    getHealth().then(x=>setMode(x.mode)).catch(()=>setMode('offline'))
    getAiPolicy().then(setAiPolicy).catch(()=>setAiPolicy(null))
    refresh()
  },[])

  useEffect(()=>{
    if(!activeContentId){ setVersions([]); return }
    listVersions(activeContentId).then(setVersions).catch(()=>setVersions([]))
  },[activeContentId])

  function opinionContext(){
    return opinions.slice(0,8).map(({title,viewpoint,reasoning,exceptions,tone_note})=>({title,viewpoint,reasoning,exceptions,tone_note}))
  }
  function knowledgeContext(){
    return knowledge.filter(x=>!x.is_sensitive).slice(0,8).map(({kind,title,summary,content,tags})=>({kind,title,summary,content:(content||'').slice(0,900),tags:tags||[]}))
  }

  function openTopic(topic){
    setActiveTopic(topic); setActiveContentId(null); setBrief(null); setDraft(null); setFactCheck(null); setCardPlan(null); setEditorialReview(null); setNativeTextPlan(null); setVersions([]); setSelectedTitle(0); setTab('editor')
  }

  async function openContent(id){
    try {
      const content = await getContent(id)
      const topic = topics.find(x=>x.id===content.topic_id) || {id:content.topic_id,title:content.topics?.title || content.title || '未命名选题'}
      setActiveTopic(topic); setActiveContentId(content.id)
      setBrief(content.brief && Object.keys(content.brief).length ? content.brief : null)
      setDraft(content.body ? {titles:content.title_options||[content.title,'',''],body:content.body,tags:content.tags||[],factual_claims:content.factual_claims||[]} : null)
      setFactCheck(content.fact_check && Object.keys(content.fact_check).length ? content.fact_check : null)
      setCardPlan(content.card_plan && Object.keys(content.card_plan).length ? content.card_plan : null)
      setEditorialReview(content.editorial_review && Object.keys(content.editorial_review).length ? content.editorial_review : null)
      setNativeTextPlan(content.native_text_plan && Object.keys(content.native_text_plan).length ? content.native_text_plan : null)
      const idx=(content.title_options||[]).indexOf(content.title); setSelectedTitle(idx>=0?idx:0)
      setTab('editor')
    } catch(e){ setToast(`打开内容失败：${e.message}`) }
  }

  async function manualTopic(title){
    if(title.trim().length<2) return
    try {
      const topic=await createTopic({title:title.trim(),raw_input:title.trim(),status:'SELECTED'})
      setTopics([topic,...topics]); openTopic(topic)
    } catch(e){ setToast(`创建选题失败：${e.message}`) }
  }

  async function saveEditor(status='REVIEW', reason='manual_save'){
    if(!activeTopic || !brief) return null
    try {
      const saved=await saveContent({
        contentId:activeContentId,
        topicId:activeTopic.id,
        selectedTitle:draft?.titles?.[selectedTitle] || '',
        titleOptions:draft?.titles || [],
        brief,
        body:draft?.body || '',
        tags:draft?.tags || [],
        factualClaims:draft?.factual_claims || [],
        factCheck:factCheck || {},
        cardPlan:cardPlan || {},
        editorialReview:editorialReview || {},
        nativeTextPlan:nativeTextPlan || {},
        status,
        reason,
      })
      setActiveContentId(saved.id)
      setToast('已保存到云端，并记录版本。')
      await refresh()
      setVersions(await listVersions(saved.id))
      return saved
    } catch(e){ setToast(`保存失败：${e.message}`); return null }
  }

  async function approve(){
    if(!editorialReview){ setToast('请先完成总编审稿。'); return }
    if(editorialReview.publish_ready===false){ setToast('总编审稿仍建议修改，处理后再通过。'); return }
    if(!factCheck){ setToast('请先完成事实核验。'); return }
    const unresolved=(factCheck.items||[]).filter(x=>!['verified','manual_verified'].includes(x.status))
    const highRisk=(factCheck.compliance_flags||[]).filter(x=>x.severity==='high')
    if(unresolved.length){ setToast(`还有 ${unresolved.length} 项事实未确认，暂不能通过。`); return }
    if(highRisk.length){ setToast(`还有 ${highRisk.length} 项高风险表述，处理后再通过。`); return }
    const saved=await saveEditor('REVIEW','manual_save')
    if(!saved) return
    try { await approveContent(saved.id); if(nativeTextPlan?.automation_ready) await queuePublishJob(saved.id,nativeTextPlan); setToast(nativeTextPlan?.automation_ready?'✓ 已审核通过，并已进入原生文转图发布队列':'✓ 已审核通过并保存到云端'); await refresh() }
    catch(e){ setToast(`审核记录失败：${e.message}`) }
  }

  function restoreVersion(item){
    const s=item.snapshot || {}
    setBrief(s.brief||null)
    setFactCheck(s.fact_check && Object.keys(s.fact_check).length ? s.fact_check : null)
    setCardPlan(s.card_plan && Object.keys(s.card_plan).length ? s.card_plan : null)
    setEditorialReview(s.editorial_review && Object.keys(s.editorial_review).length ? s.editorial_review : null)
    setNativeTextPlan(s.native_text_plan && Object.keys(s.native_text_plan).length ? s.native_text_plan : null)
    setDraft(s.body ? {titles:s.title_options||[s.title,'',''],body:s.body,tags:s.tags||[],factual_claims:s.factual_claims||[]} : null)
    const idx=(s.title_options||[]).indexOf(s.title); setSelectedTitle(idx>=0?idx:0)
    setToast(`已载入 v${item.version}，点击“保存版本”即可恢复为新版本。`)
  }

  const ctx={
    topics,contents,opinions,calendarItems,knowledge,leads,bridgeRuns,radarSources,watchQueries,trendSignals,xhsAccounts,researchRuns,posts,metrics,aiPolicy,preferences,setPreferences,activeTopic,activeContentId,setActiveContentId,brief,setBrief,draft,setDraft,factCheck,setFactCheck,cardPlan,setCardPlan,editorialReview,setEditorialReview,nativeTextPlan,setNativeTextPlan,selectedTitle,setSelectedTitle,
    versions,mode,loading,openTopic,openContent,manualTopic,saveEditor,approve,restoreVersion,refresh,opinionContext,knowledgeContext,setToast,
  }

  return <div className="appShell">
    <header className="topbar">
      <div><div className="eyebrow">CONTENT OS · V0.9</div><strong>升学内容工作台</strong></div>
      <div className="topActions">
        <span className={`dot ${preferences.ai_mode==='manual'?'manual':mode}`}></span><span className="aiModeLabel">{preferences.ai_mode==='manual'?'手动 AI':mode==='openai'?'API AI':'演示'}</span>
        {supabaseConfigured ? <button className="iconButton" onClick={()=>supabase.auth.signOut()} title={session?.user?.email}>退出</button> : <span className="demoBadge">本机演示</span>}
      </div>
    </header>

    <div className="pageWrap">
      {tab==='home' && <Dashboard ctx={ctx} go={setTab}/>}
      {tab==='topics' && <TopicPool ctx={ctx}/>}
      {tab==='editor' && <Editor ctx={ctx}/>}
      {tab==='calendar' && <CalendarPage ctx={ctx}/>}
      {tab==='assets' && <AssetHub ctx={ctx}/>}
    </div>

    <nav className="bottomNav">
      <NavButton active={tab==='home'} onClick={()=>setTab('home')} icon="⌂" label="首页" />
      <NavButton active={tab==='topics'} onClick={()=>setTab('topics')} icon="✦" label="选题" />
      <NavButton active={tab==='editor'} onClick={()=>setTab('editor')} icon="✎" label="内容" />
      <NavButton active={tab==='calendar'} onClick={()=>setTab('calendar')} icon="▦" label="日历" />
      <NavButton active={tab==='assets'} onClick={()=>setTab('assets')} icon="◎" label="资产" />
    </nav>
    {toast && <Toast text={toast} clear={()=>setToast('')} />}
  </div>
}

function buildEditorialCandidates(ctx){
  const latestMetric={};for(const m of ctx.metrics){if(!latestMetric[m.post_id])latestMetric[m.post_id]=m}
  const perfByPurpose={}
  for(const post of ctx.posts){
    const content=ctx.contents.find(c=>c.id===post.content_id);if(!content)continue
    const topic=ctx.topics.find(t=>t.id===content.topic_id);const purpose=topic?.purpose||'decision';const m=latestMetric[post.id];if(!m)continue
    const bucket=perfByPurpose[purpose]||(perfByPurpose[purpose]={views:0,leads:0,revenue:0,n:0})
    bucket.views+=Number(m.views||0);bucket.leads+=Number(m.leads||m.qualified_leads||0);bucket.revenue+=Number(m.revenue||0);bucket.n+=1
  }
  function historical(purpose){const x=perfByPurpose[purpose];if(!x||!x.n)return 5;const leadPer10k=x.views?x.leads/x.views*10000:0;const revenuePer10k=x.views?x.revenue/x.views*10000:0;return Math.max(0,Math.min(10,4+leadPer10k*.35+Math.log10(1+revenuePer10k)*1.2))}
  const base=ctx.topics.slice(0,30).map(t=>({
    title:t.title,purpose:t.purpose||'decision',angle:t.content_type||'',source:'topic_pool',
    search_score:Number(t.score?.search_demand||5),audience_fit:Number(t.score?.creator_fit||7),conversion_score:Number(t.score?.conversion_value||6),timeliness:Number(t.score?.timeliness||5),historical_value:historical(t.purpose||'decision'),
  }))
  const trend=ctx.trendSignals.slice(0,20).map(x=>({
    title:x.title,purpose:Number(x.conversion_fit||0)>=8?'conversion':'decision',angle:x.summary||'',source:`trend:${x.platform}`,
    search_score:Number(x.search_intent||5),audience_fit:Number(x.audience_fit||7),conversion_score:Number(x.conversion_fit||6),timeliness:Number(x.freshness||5),historical_value:historical(Number(x.conversion_fit||0)>=8?'conversion':'decision'),
  }))
  const seen=new Set();return [...trend,...base].filter(x=>x.title&&!seen.has(x.title)&&seen.add(x.title)).slice(0,40)
}

function Dashboard({ctx,go}){
  const approved=ctx.contents.filter(x=>x.status==='APPROVED').length
  const drafts=ctx.contents.filter(x=>!['APPROVED','PUBLISHED','ANALYZED'].includes(x.status)).length
  return <>
    <section className="pageHero">
      <div><span className="kicker">TODAY</span><h1>今天，把一个判断讲清楚。</h1></div>
      <button className="primary compact" onClick={()=>go('topics')}>找选题</button>
    </section>
    <AutopilotPanel ctx={ctx}/>
    <EditorialDirectorPanel ctx={ctx}/>
    {!supabaseConfigured && <div className="notice">当前没有配置 Supabase，数据保存在本机浏览器。配置后即可跨设备同步。</div>}
    <div className="statGrid">
      <Stat value={ctx.topics.length} label="选题池" />
      <Stat value={drafts} label="进行中" />
      <Stat value={approved} label="已审核" />
      <Stat value={ctx.calendarItems.length} label="已排期" />
    </div>
    <section className="panel">
      <SectionHead title="最近内容" action="查看选题" onAction={()=>go('topics')}/>
      {ctx.loading ? <Empty text="正在读取…"/> : ctx.contents.length===0 ? <Empty text="还没有内容。先从一个选题开始。"/> :
        ctx.contents.slice(0,6).map(item=><ContentRow key={item.id} item={item} onClick={()=>ctx.openContent(item.id)}/>)}
    </section>
    <section className="panel">
      <SectionHead title="接下来要发" action="内容日历" onAction={()=>go('calendar')}/>
      {ctx.calendarItems.length===0 ? <Empty text="还没有排期。生成一个 30 天内容日历。"/> : ctx.calendarItems.slice(0,4).map(item=><div className="upcomingRow" key={item.id}><div className={`purposeDot ${item.purpose}`}></div><div><strong>{item.title}</strong><span>{formatDateShort(item.planned_date)} · {purposeLabel(item.purpose)}</span></div></div>)}
    </section>
    <section className="panel">
      <SectionHead title="置顶观点" action="资产库" onAction={()=>go('assets')}/>
      {ctx.opinions.filter(x=>x.is_pinned).slice(0,3).map(op=><div className="opinionMini" key={op.id}><strong>{op.title}</strong><p>{op.viewpoint}</p></div>)}
      {!ctx.opinions.some(x=>x.is_pinned) && <Empty text="把你最重要的判断加入观点库，AI 写稿会优先参考。"/>}
    </section>
  </>
}


function AutopilotPanel({ctx}){
  const [busy,setBusy]=useState(false)
  async function run(){
    if((ctx.preferences?.ai_mode||'manual')!=='api'){ctx.setToast('当前是零 API 模式：请到“资产 → AI桥”生成今日任务包。');return}
    const candidates=buildEditorialCandidates(ctx)
    if(!candidates.length){ctx.setToast('选题池/热点池还没有候选内容。');return}
    setBusy(true)
    try{
      const style=ctx.preferences?.config?.editorial_style?.notes||DEFAULT_EDITORIAL_STYLE
      const preferred=ctx.preferences?.config?.xhs_native_text?.preferred_style||'简约'
      const x=await runAutopilot({
        candidates,recent_titles:ctx.contents.slice(0,30).map(v=>v.title).filter(Boolean),goal:'qualified_leads',
        editorial_style:style,opinions:ctx.opinionContext(),target_audience:'北京高中生及家长',
        max_web_runs:Number(ctx.preferences?.config?.api_budget?.web_runs_per_request||2),preferred_xhs_style:preferred,
        max_pages_hint:7,include_repurpose:true,include_cards:false,
      })
      const pkg=x.package;const pick=x.editorial_pick
      let topic=ctx.topics.find(t=>t.title.trim()===pkg.topic.trim())
      if(!topic)topic=await createTopic({title:pkg.topic,raw_input:pkg.topic,target_audience:pick.target_audience,purpose:pick.purpose,content_type:'Autopilot',status:'SELECTED'})
      const saved=await saveContent({contentId:null,topicId:topic.id,selectedTitle:pkg.draft.titles[0],titleOptions:pkg.draft.titles,brief:pkg.brief,body:pkg.draft.body,tags:pkg.draft.tags,factualClaims:pkg.draft.factual_claims,factCheck:pkg.fact_check,cardPlan:pkg.card_plan||{},editorialReview:pkg.editorial_review,nativeTextPlan:pkg.native_text_plan,status:'FACT_CHECK',reason:'autopilot'})
      await saveFactCheck(saved.id,pkg.fact_check)
      await saveEditorialReview(saved.id,pkg.editorial_review)
      await saveNativeTextPlan(saved.id,pkg.native_text_plan)
      if(pkg.card_plan?.cards?.length)await saveCardPlan(saved.id,pkg.card_plan)
      if(pkg.repurpose?.length)await saveRepurposedOutputs(saved.id,pkg.repurpose)
      await ctx.refresh();await ctx.openContent(saved.id)
      ctx.setToast(pkg.ready_for_human_review?'✓ 今日待审稿已自动准备完成，你只需要审核。':`待审稿已生成，但有 ${pkg.blockers.length} 个门禁项需要你处理。`)
    }catch(e){ctx.setToast(`Autopilot 失败：${e.message}`)}finally{setBusy(false)}
  }
  const apiMode=(ctx.preferences?.ai_mode||'manual')==='api'
  return <section className="panel autopilotPanel"><div className="sectionHead"><div><span className="liveBadge">AUTOPILOT</span><h2>一键生成今日待审稿</h2></div><span className={`modeChip ${apiMode?'on':'off'}`}>{apiMode?'API自动':'零API'}</span></div><p className="muted">自动完成：选题 → Brief → 成稿 → 独立总编审稿 → 最终正文事实核验 → 原生文转图发布包 → 多平台复用。你打开结果后只做最终审核。</p><button className="approve wide" disabled={busy||!apiMode} onClick={run}>{busy?'正在跑完整生产链路…':apiMode?'生成今日待审稿':'零 API 模式请使用 AI桥'}</button></section>
}

function EditorialDirectorPanel({ctx}){
  const [result,setResult]=useState(null)
  const [busy,setBusy]=useState(false)
  function candidates(){return buildEditorialCandidates(ctx)}
  async function run(){
    const items=candidates();if(!items.length){ctx.setToast('选题池/热点池还没有候选内容。');return}
    setBusy(true)
    try{
      const style=ctx.preferences?.config?.editorial_style?.notes||DEFAULT_EDITORIAL_STYLE
      const x=await runEditorialDirector({candidates:items,recent_titles:ctx.contents.slice(0,20).map(x=>x.title).filter(Boolean),goal:'qualified_leads',editorial_style:style})
      setResult(x.data);ctx.setToast(x.mode==='mock'?'已按本地权重生成总编推荐。':'总编已选出今日主推与备选。')
    }catch(e){ctx.setToast(`总编推荐失败：${e.message}`)}finally{setBusy(false)}
  }
  async function adopt(pick){
    let topic=ctx.topics.find(x=>x.title===pick.title)
    try{
      if(!topic) topic=await createTopic({title:pick.title,raw_input:pick.title,target_audience:pick.target_audience,purpose:pick.purpose,content_type:'总编推荐',status:'SELECTED'})
      await ctx.refresh();ctx.openTopic(topic)
    }catch(e){ctx.setToast(`采用失败：${e.message}`)}
  }
  return <section className="panel editorialDirector">
    <div className="sectionHead"><div><span className="liveBadge">EDITOR</span><h2>今日总编推荐</h2></div><button className="textButton" onClick={run} disabled={busy}>{busy?'正在挑…':'重新挑题'}</button></div>
    {!result?<><p className="muted">系统只给你一个主推和一个备选，不再让你自己从十几个题里挑。旧职场文风不会被默认继承。</p><button className="primary wide" onClick={run} disabled={busy}>{busy?'正在挑…':'生成今日主推'}</button></>:<div className="editorialPicks">
      {[['主推',result.primary],['备选',result.backup]].map(([label,pick])=><article className={`editorialPick ${label==='主推'?'primaryPick':''}`} key={label}><span className="typePill">{label}</span><h3>{pick.title}</h3><p>{pick.angle}</p><small>{pick.why_this_over_others}</small><div className="pickFoot"><span>线索质量 {pick.predicted_lead_quality}/10</span><button onClick={()=>adopt(pick)}>采用 →</button></div></article>)}
    </div>}
  </section>
}

function TopicPool({ctx}){
  const [seed,setSeed]=useState('')
  const [suggestions,setSuggestions]=useState([])
  const [busy,setBusy]=useState(false)
  const [manual,setManual]=useState('')

  async function generate(){
    setBusy(true)
    try {
      const x=await suggestTopics({seed,count:8,recent_topics:ctx.topics.slice(0,20).map(t=>t.title),opinions:ctx.opinionContext()})
      setSuggestions(x.data.topics); ctx.setToast(x.mode==='mock'?'已生成演示选题；配置 OpenAI API 后会使用真实模型。':'已生成新选题。')
    } catch(e){ctx.setToast(`选题生成失败：${e.message}`)} finally{setBusy(false)}
  }

  async function adopt(item){
    try {
      const topic=await createTopic({
        title:item.title, raw_input:item.title, target_audience:item.target_audience, purpose:item.purpose,
        content_type:'AI策划', score:{search_demand:item.search_demand,controversy:item.controversy,conversion_value:item.conversion_value,timeliness:item.timeliness,creator_fit:item.creator_fit}, status:'SELECTED',
      })
      await ctx.refresh(); ctx.openTopic(topic)
    } catch(e){ctx.setToast(`加入选题池失败：${e.message}`)}
  }

  return <>
    <section className="pageHero"><div><span className="kicker">TOPIC POOL</span><h1>不是“发什么”，而是“什么值得讲”。</h1></div></section>
    <TrendIntelligencePanel ctx={ctx}/>
    <RadarPanel ctx={ctx}/>
    <section className="panel">
      <label>给 AI 一个方向（可留空）</label>
      <textarea rows="2" value={seed} onChange={e=>setSeed(e.target.value)} placeholder="例如：北京650分、金融专业、AI对专业选择的影响"/>
      <button className="primary wide" onClick={generate} disabled={busy}>{busy?'正在策划…':'✦ 生成 8 个候选选题'}</button>
    </section>
    {suggestions.length>0 && <section className="panel"><SectionHead title="AI 推荐" />
      <div className="topicCards">{suggestions.map((item,i)=><TopicCard key={i} item={item} onAdopt={()=>adopt(item)}/>)}</div>
    </section>}
    <section className="panel">
      <SectionHead title="手工记一个灵感"/>
      <div className="inlineCreate"><input value={manual} onChange={e=>setManual(e.target.value)} placeholder="想到什么先记下来"/><button className="darkMini" onClick={()=>{ctx.manualTopic(manual);setManual('')}}>开始写</button></div>
    </section>
    <section className="panel"><SectionHead title={`已有选题 · ${ctx.topics.length}`}/>
      {ctx.topics.length===0 ? <Empty text="选题池还是空的。"/> : ctx.topics.map(t=><div className="topicRow" key={t.id} onClick={()=>ctx.openTopic(t)}><div><strong>{t.title}</strong><span>{purposeLabel(t.purpose)} · {statusLabel(t.status)}</span></div><b>›</b></div>)}
    </section>
  </>
}

function TopicCard({item,onAdopt}){
  const avg=((item.search_demand+item.controversy+item.conversion_value+item.timeliness+item.creator_fit)/5).toFixed(1)
  return <article className="topicCard">
    <div className="topicScore">{avg}</div>
    <h3>{item.title}</h3>
    <p>{item.angle}</p>
    <div className="scoreLine"><span>搜索 {item.search_demand}</span><span>争议 {item.controversy}</span><span>转化 {item.conversion_value}</span><span>匹配 {item.creator_fit}</span></div>
    <div className="topicFoot"><span className="typePill">{purposeLabel(item.purpose)}</span><button onClick={onAdopt}>采用 →</button></div>
  </article>
}

function TrendIntelligencePanel({ctx}){
  const [query,setQuery]=useState('')
  const [queryType,setQueryType]=useState('keyword')
  const [prompt,setPrompt]=useState('')
  const [paste,setPaste]=useState('')
  const [busy,setBusy]=useState('')
  const [showSettings,setShowSettings]=useState(false)

  const activeQueries=ctx.watchQueries.filter(x=>x.enabled!==false)
  const signals=ctx.trendSignals.slice(0,30)
  const score=s=>((Number(s.search_intent||0)*0.28)+(Number(s.engagement_signal||0)*0.12)+(Number(s.freshness||0)*0.18)+(Number(s.audience_fit||0)*0.20)+(Number(s.conversion_fit||0)*0.22)).toFixed(1)

  async function addQuery(){
    if(!query.trim())return
    try{await saveWatchQuery({query:query.trim(),query_type:queryType,weight:1,enabled:true});setQuery('');await ctx.refresh();ctx.setToast('已加入定向检索词。')}
    catch(e){ctx.setToast(`添加失败：${e.message}`)}
  }
  async function removeQuery(id){try{await deleteWatchQuery(id);await ctx.refresh()}catch(e){ctx.setToast(`删除失败：${e.message}`)}}
  async function toggleSource(src){try{await updateRadarSource(src.id,{enabled:!src.enabled});await ctx.refresh()}catch(e){ctx.setToast(`更新检索源失败：${e.message}`)}}

  function makeBridgePrompt(){
    const text=buildTrendBridgePrompt({focus:'北京高考、大学与专业选择',watchQueries:ctx.watchQueries,radarSources:ctx.radarSources,recentTopics:ctx.topics.map(x=>x.title)})
    setPrompt(text);return text
  }
  async function copyBridgePrompt(){
    const text=prompt||makeBridgePrompt()
    try{await navigator.clipboard.writeText(text);ctx.setToast('热点扫描提示词已复制。去 ChatGPT/Codex 联网跑一次，再把 JSON 粘回来。')}
    catch(e){ctx.setToast(`复制失败：${e.message}`)}
  }
  async function importBridge(){
    if(!paste.trim())return
    try{
      const parsed=normalizeTrendSweep(extractJson(paste));await saveTrendSignals(parsed.signals);setPaste('');await ctx.refresh();ctx.setToast(`已导入 ${parsed.signals.length} 条热点信号。`)
    }catch(e){ctx.setToast(`导入失败：${e.message}`)}
  }
  async function runApiSweep(){
    setBusy('api')
    try{
      const payload={focus:'北京高考、大学与专业选择',max_web_runs:Number(ctx.preferences?.config?.api_budget?.web_runs_per_request||2),watch_queries:activeQueries.filter(x=>x.query_type!=='competitor').map(x=>x.query),competitor_queries:activeQueries.filter(x=>x.query_type==='competitor').map(x=>x.query),recent_topics:ctx.topics.slice(0,40).map(x=>x.title),count:20}
      const x=await sweepTrendSignals(payload);await saveTrendSignals(x.data.signals||[]);await ctx.refresh();ctx.setToast(x.mode==='mock'?'当前为演示扫描；零 API 模式请用“复制联网扫描提示词”。':'多源热点扫描完成。')
    }catch(e){ctx.setToast(`热点扫描失败：${e.message}`)}finally{setBusy('')}
  }
  async function adoptSignal(sig){
    try{
      const topic=await createTopic({title:sig.title,raw_input:sig.title,target_audience:'北京高中生及家长',purpose:Number(sig.conversion_fit||0)>=8?'conversion':'decision',content_type:'热点情报',score:{search_demand:sig.search_intent,controversy:sig.engagement_signal,conversion_value:sig.conversion_fit,timeliness:sig.freshness,creator_fit:sig.audience_fit},radar_meta:{signal_source:sig.platform,surface:sig.surface,query:sig.query,confidence:sig.confidence,source:sig.source||null},status:'SELECTED'})
      await ctx.refresh();ctx.openTopic(topic)
    }catch(e){ctx.setToast(`转成选题失败：${e.message}`)}
  }

  return <section className="panel intelligencePanel">
    <div className="sectionHead"><div><span className="liveBadge">INTEL</span><h2>多源热点雷达</h2></div><button className="textButton" onClick={()=>setShowSettings(!showSettings)}>{showSettings?'收起':'检索设置'}</button></div>
    <p className="muted radarIntro">小红书热点/热议、定向关键词、同类账号、官方政策、高校变化、就业趋势统一进一个信号池。</p>
    {showSettings&&<div className="intelSettings">
      <div className="sourceGrid">{ctx.radarSources.map(src=><button key={src.id} className={`sourceToggle ${src.enabled?'on':''}`} onClick={()=>toggleSource(src)}><b>{src.name}</b><span>{src.enabled?'开启':'关闭'} · 权重 {src.weight}</span></button>)}</div>
      <div className="queryBuilder"><select value={queryType} onChange={e=>setQueryType(e.target.value)}><option value="keyword">关键词</option><option value="question">家长问题</option><option value="competitor">同类账号/竞品</option></select><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="例如：北京650分 / 金融专业 / 北邮计算机"/><button className="darkMini" onClick={addQuery}>加入</button></div>
      <div className="watchChips">{ctx.watchQueries.map(q=><span className="watchChip" key={q.id}>{q.query}<small>{q.query_type}</small><button onClick={()=>removeQuery(q.id)}>×</button></span>)}</div>
    </div>}
    <div className="intelActions"><button className="primary" onClick={copyBridgePrompt}>复制联网扫描提示词</button><button className="ghost" onClick={runApiSweep} disabled={busy==='api'}>{busy==='api'?'扫描中…':'API 扫描（可选）'}</button></div>
    <p className="microcopy">零 API 用法：复制提示词 → 在 ChatGPT/Codex 开联网检索 → 把返回 JSON 粘回来。以后有 Mac 再接站内 Research Collector。</p>
    {prompt&&<details className="bridgeDetails"><summary>查看扫描提示词</summary><textarea rows="8" value={prompt} readOnly/></details>}
    <div className="bridgeImport"><textarea rows="4" value={paste} onChange={e=>setPaste(e.target.value)} placeholder="把 ChatGPT/Codex 返回的热点 JSON 粘到这里"/><button className="darkMini" onClick={importBridge}>导入热点</button></div>
    {signals.length>0&&<div className="signalList"><div className="signalHead"><strong>最近热点信号</strong><span>{signals.length} 条</span></div>{signals.map(sig=><article className="signalCard" key={sig.id||`${sig.title}-${sig.observed_at}`}>
      <div className="signalMeta"><span className={`platformPill ${sig.platform}`}>{sig.platform==='xiaohongshu'?'小红书':sig.platform==='official'?'官方':sig.platform==='university'?'高校':'全网'}</span><span>{sig.surface}</span><b>{score(sig)}</b></div>
      <h3>{sig.title}</h3><p>{sig.summary}</p>
      <div className="scoreLine"><span>搜索 {sig.search_intent}</span><span>新鲜 {sig.freshness}</span><span>受众 {sig.audience_fit}</span><span>转化 {sig.conversion_fit}</span></div>
      <div className="signalFoot">{sig.source?.url?<a href={sig.source.url} target="_blank" rel="noreferrer">查看来源 ↗</a>:<span className="muted">无公开来源 · 需人工验证</span>}<button onClick={()=>adoptSignal(sig)}>转成选题 →</button></div>
    </article>)}</div>}
  </section>
}

function RadarPanel({ctx}){
  const [focus,setFocus]=useState('北京高考、大学与专业选择')
  const [radar,setRadar]=useState(null)
  const [busy,setBusy]=useState(false)

  async function scan(){
    setBusy(true)
    try{
      const x=await scanTopicRadar({focus,count:8,max_web_runs:Number(ctx.preferences?.config?.api_budget?.web_runs_per_request||2),recent_topics:ctx.topics.slice(0,30).map(t=>t.title),opinions:ctx.opinionContext()})
      setRadar(x.data)
      ctx.setToast(x.mode==='mock'?'已生成演示雷达；配置 API 后会联网扫描最新信号。':'选题雷达扫描完成。')
    }catch(e){ctx.setToast(`雷达扫描失败：${e.message}`)}finally{setBusy(false)}
  }

  async function adopt(item){
    try{
      const topic=await createTopic({
        title:item.title, raw_input:item.title, target_audience:item.target_audience, purpose:item.purpose,
        content_type:'选题雷达',
        score:{search_demand:item.search_demand,controversy:item.controversy,conversion_value:item.conversion_value,timeliness:item.timeliness,creator_fit:item.creator_fit},
        radar_meta:{signal_type:item.signal_type,why_now:item.why_now,confidence:item.confidence,sources:item.sources||[]},
        status:'SELECTED',
      })
      await ctx.refresh(); ctx.openTopic(topic)
    }catch(e){ctx.setToast(`采用雷达选题失败：${e.message}`)}
  }

  return <section className="panel radarPanel">
    <div className="sectionHead"><div><span className="liveBadge">LIVE</span><h2>选题雷达</h2></div><span className="radarHint">热点只在有来源时算热点</span></div>
    <p className="muted radarIntro">扫描政策、招生、就业与家长决策信号，把新闻变成“现在为什么值得讲”的选题。</p>
    <div className="inlineCreate"><input value={focus} onChange={e=>setFocus(e.target.value)} placeholder="例如：北京高考、AI与专业选择"/><button className="darkMini" onClick={scan} disabled={busy}>{busy?'扫描中…':'扫描'}</button></div>
    {radar && <>
      <div className="radarSummary"><strong>{radar.summary}</strong><span>{radar.searched_web?'已联网':'演示模式'}</span></div>
      <div className="radarList">{(radar.topics||[]).map((item,i)=><article className="radarCard" key={`${item.title}-${i}`}>
        <div className="radarTop"><div><span className={`signalPill ${item.signal_type}`}>{signalLabel(item.signal_type)}</span><span className="confidence">可信度 {Math.round((item.confidence||0)*100)}%</span></div><span className="topicScore">{((item.search_demand+item.conversion_value+item.timeliness+item.creator_fit)/4).toFixed(1)}</span></div>
        <h3>{item.title}</h3><p>{item.angle}</p>
        <div className="whyNow"><b>为什么现在：</b>{item.why_now}</div>
        {item.sources?.length>0 && <div className="radarSources">{item.sources.slice(0,3).map((src,j)=><a href={src.url} target="_blank" rel="noreferrer" key={j}>{src.publisher||src.title||'查看来源'} ↗</a>)}</div>}
        <div className="topicFoot"><span className="typePill">{purposeLabel(item.purpose)}</span><button onClick={()=>adopt(item)}>采用并写 →</button></div>
      </article>)}</div>
    </>}
  </section>
}

function CalendarPage({ctx}){
  const [startDate,setStartDate]=useState(todayIso())
  const [postsPerWeek,setPostsPerWeek]=useState(5)
  const [plan,setPlan]=useState(null)
  const [busy,setBusy]=useState('')
  const endDate=addDaysIso(startDate,29)
  const visible=ctx.calendarItems.filter(x=>x.planned_date>=startDate&&x.planned_date<=endDate)

  async function generate(){
    setBusy('generate')
    try{
      const x=await planCalendar({
        start_date:startDate, days:30, posts_per_week:Number(postsPerWeek),
        content_mix:{traffic:.30,decision:.30,trust:.20,professional:.15,conversion:.05},
        topic_pool:ctx.topics.slice(0,60).map(t=>({title:t.title,purpose:t.purpose||'decision',target_audience:t.target_audience||'',score:t.score||{}})),
        recent_titles:ctx.contents.slice(0,30).map(c=>c.title||c.topics?.title).filter(Boolean),
        opinions:ctx.opinionContext(),
      })
      setPlan(x.data)
      ctx.setToast(x.mode==='mock'?'已生成演示排期；配置 API 后会结合你的选题池智能编排。':'30 天内容日历已生成，确认后保存。')
    }catch(e){ctx.setToast(`生成日历失败：${e.message}`)}finally{setBusy('')}
  }

  async function savePlan(){
    if(!plan?.entries?.length) return
    setBusy('save')
    try{
      const items=plan.entries.map(item=>{
        const topic=ctx.topics.find(t=>t.title===item.source_topic_title)||ctx.topics.find(t=>t.title===item.title)
        return {...item,planned_date:String(item.planned_date),topic_id:topic?.id||null,status:'planned',metadata:{generated_by:'v0.4'}}
      })
      await replaceCalendarItems(startDate,endDate,items)
      await ctx.refresh(); ctx.setToast(`已保存 ${items.length} 个排期。`)
    }catch(e){ctx.setToast(`保存日历失败：${e.message}`)}finally{setBusy('')}
  }

  async function startWriting(item){
    try{
      let topic=item.topic_id ? ctx.topics.find(t=>t.id===item.topic_id) : null
      if(!topic) topic=ctx.topics.find(t=>t.title===item.source_topic_title)||ctx.topics.find(t=>t.title===item.title)
      if(!topic) topic=await createTopic({title:item.title,raw_input:item.title,purpose:item.purpose,target_audience:'北京高中生及家长',content_type:'内容日历',status:'SELECTED'})
      await updateCalendarItem(item.id,{topic_id:topic.id,status:'drafting'})
      await ctx.refresh(); ctx.openTopic(topic)
    }catch(e){ctx.setToast(`开始写作失败：${e.message}`)}
  }

  async function removeItem(item){
    try{await deleteCalendarItem(item.id);await ctx.refresh();ctx.setToast('已从日历移除。')}catch(e){ctx.setToast(`移除失败：${e.message}`)}
  }

  const displayItems=plan?.entries?.length ? plan.entries.map((x,i)=>({...x,id:`preview-${i}`,preview:true})) : visible
  return <>
    <section className="pageHero"><div><span className="kicker">30-DAY CALENDAR</span><h1>让内容有节奏，不靠每天临时想。</h1><p>流量、判断、信任、专业和转化一起排，不连续硬卖。</p></div></section>
    <section className="panel calendarControl">
      <div className="grid2"><div className="field"><label>从哪天开始</label><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></div><div className="field"><label>每周发几篇</label><select value={postsPerWeek} onChange={e=>setPostsPerWeek(Number(e.target.value))}>{[3,4,5,6,7].map(n=><option value={n} key={n}>{n} 篇</option>)}</select></div></div>
      <div className="mixBar"><span>流量 30%</span><span>决策 30%</span><span>信任 20%</span><span>专业 15%</span><span>转化 5%</span></div>
      <button className="primary wide" onClick={generate} disabled={busy==='generate'}>{busy==='generate'?'正在排 30 天…':'✦ 生成 30 天内容日历'}</button>
      {plan && <div className="calendarSummary"><strong>{plan.strategy_summary}</strong><div>{Object.entries(plan.mix_summary||{}).map(([k,v])=><span key={k}>{purposeLabel(k)} {v}</span>)}</div></div>}
      {plan && <div className="reviewActions"><button className="ghost" onClick={()=>setPlan(null)}>取消预览</button><button className="approve" onClick={savePlan} disabled={busy==='save'}>{busy==='save'?'保存中…':'保存这套排期'}</button></div>}
    </section>
    <section className="panel"><SectionHead title={`${plan?'预览':'已保存排期'} · ${displayItems.length} 篇`}/>
      {displayItems.length===0 ? <Empty text="还没有排期。上面生成一套 30 天节奏。"/> : <div className="calendarTimeline">{displayItems.map(item=><article className={`calendarItem ${item.preview?'preview':''}`} key={item.id}>
        <div className="calendarDate"><b>{formatDateShort(item.planned_date)}</b><span>{weekdayLabel(item.planned_date)}</span></div>
        <div className="calendarBody"><div><span className={`purposePill ${item.purpose}`}>{purposeLabel(item.purpose)}</span>{item.status==='drafting'&&<span className="draftingPill">写作中</span>}</div><h3>{item.title}</h3>{item.angle&&<p>{item.angle}</p>}{item.rationale&&<small>{item.rationale}</small>}</div>
        {!item.preview && <div className="calendarActions"><button onClick={()=>startWriting(item)}>开始写</button><button className="dangerText" onClick={()=>removeItem(item)}>移除</button></div>}
      </article>)}</div>}
    </section>
  </>
}


function Editor({ctx}){
  const [manual,setManual]=useState('')
  const [busy,setBusy]=useState('')
  const canDraft=ctx.brief && !busy

  // activeContentId lives in parent; this helper saves through parent and guarantees the id is captured there.
  async function makeBriefViaParent(){
    if(!ctx.activeTopic) return
    setBusy('brief')
    try{
      const x=await generateBrief({topic:ctx.activeTopic.title,opinions:ctx.opinionContext()})
      ctx.setBrief(x.data); ctx.setDraft(null); ctx.setEditorialReview(null); ctx.setFactCheck(null); ctx.setNativeTextPlan(null); ctx.setCardPlan(null); ctx.setSelectedTitle(0)
      // Parent saveEditor needs state to settle, so save directly and reload the just-created content through refresh.
      const saved=await saveContent({contentId:ctx.activeContentId,topicId:ctx.activeTopic.id,selectedTitle:'',titleOptions:[],brief:x.data,body:'',tags:[],factualClaims:[],factCheck:{},cardPlan:{},status:'BRIEF_READY',reason:'generate_brief'})
      await ctx.refresh(); await ctx.openContent(saved.id); ctx.setToast('Brief 已生成并保存版本。')
    }catch(e){ctx.setToast(`生成 Brief 失败：${e.message}`)}finally{setBusy('')}
  }

  async function makeDraft(){
    if(!ctx.brief||!ctx.activeTopic) return
    setBusy('draft')
    try{
      const x=await generateDraft({topic:ctx.activeTopic.title,brief:ctx.brief,opinions:ctx.opinionContext()})
      const style=ctx.preferences?.config?.editorial_style?.notes||DEFAULT_EDITORIAL_STYLE
      const reviewed=await reviewEditorial({topic:ctx.activeTopic.title,title:x.data.titles[0],body:x.data.body,target_audience:ctx.brief.target_audience||'北京高中生及家长',editorial_style:style})
      const nextDraft={...x.data,titles:[reviewed.data.revised_title,...x.data.titles.filter(t=>t!==reviewed.data.revised_title)].slice(0,3),body:reviewed.data.revised_body}
      while(nextDraft.titles.length<3) nextDraft.titles.push(x.data.titles[nextDraft.titles.length]||nextDraft.titles[0])
      ctx.setDraft(nextDraft);ctx.setEditorialReview(reviewed.data);ctx.setFactCheck(null);ctx.setCardPlan(null);ctx.setNativeTextPlan(null);ctx.setSelectedTitle(0)
      const saved=await saveContent({contentId:ctx.activeContentId,topicId:ctx.activeTopic.id,selectedTitle:nextDraft.titles[0],titleOptions:nextDraft.titles,brief:ctx.brief,body:nextDraft.body,tags:nextDraft.tags,factualClaims:nextDraft.factual_claims,factCheck:{},cardPlan:{},status:'DRAFT_READY',reason:'generate_draft'})
      await saveEditorialReview(saved.id,reviewed.data)
      await ctx.refresh(); await ctx.openContent(saved.id); ctx.setToast(`成稿已生成并完成总编审稿 · ${Math.round(reviewed.data.overall_score)}分`)
    }catch(e){ctx.setToast(`生成成稿失败：${e.message}`)}finally{setBusy('')}
  }

  async function reviewDraft(){
    if(!ctx.draft||!ctx.activeContentId)return
    setBusy('review')
    try{
      const style=ctx.preferences?.config?.editorial_style?.notes||DEFAULT_EDITORIAL_STYLE
      const title=ctx.draft.titles?.[ctx.selectedTitle]||ctx.activeTopic.title
      const x=await reviewEditorial({topic:ctx.activeTopic.title,title,body:ctx.draft.body,target_audience:ctx.brief?.target_audience||'北京高中生及家长',editorial_style:style})
      const titles=[...ctx.draft.titles];titles[ctx.selectedTitle]=x.data.revised_title
      ctx.setDraft({...ctx.draft,titles,body:x.data.revised_body});ctx.setEditorialReview(x.data);ctx.setFactCheck(null);ctx.setNativeTextPlan(null);ctx.setCardPlan(null)
      await saveEditorialReview(ctx.activeContentId,x.data);ctx.setToast(`总编复核完成 · ${Math.round(x.data.overall_score)}分`)
    }catch(e){ctx.setToast(`总编复核失败：${e.message}`)}finally{setBusy('')}
  }

  async function makeNativeText(){
    if(!ctx.draft||!ctx.activeContentId)return
    setBusy('native')
    try{
      const title=ctx.draft.titles?.[ctx.selectedTitle]||ctx.activeTopic.title
      const preferred=ctx.preferences?.config?.xhs_native_text?.preferred_style||'简约'
      const x=await buildXhsNativeTextPlan({topic:ctx.activeTopic.title,title,body:ctx.draft.body,preferred_style:preferred,max_pages_hint:7})
      ctx.setNativeTextPlan(x.data);await saveNativeTextPlan(ctx.activeContentId,x.data);ctx.setToast(`原生文转图稿已准备 · 推荐${x.data.recommended_style} · 约${x.data.expected_pages}页`)
    }catch(e){ctx.setToast(`原生文转图整理失败：${e.message}`)}finally{setBusy('')}
  }

  async function copyNativeText(){
    if(!ctx.nativeTextPlan)return
    try{await navigator.clipboard.writeText(ctx.nativeTextPlan.input_text);ctx.setToast('原生文转图稿已复制。')}
    catch(e){ctx.setToast(`复制失败：${e.message}`)}
  }

  async function checkFacts(){
    if(!ctx.draft||!ctx.activeContentId) return
    setBusy('facts')
    try{
      const saved=await ctx.saveEditor('DRAFT_READY','manual_save')
      if(!saved) return
      const title=ctx.draft.titles?.[ctx.selectedTitle] || ''
      const x=await runFactCheck({topic:ctx.activeTopic.title,title,body:ctx.draft.body,claims:ctx.draft.factual_claims||[],max_web_runs:Number(ctx.preferences?.config?.api_budget?.web_runs_per_request||2)})
      ctx.setFactCheck(x.data)
      await saveFactCheck(saved.id,x.data)
      await ctx.refresh()
      ctx.setToast(x.mode==='mock'?'已完成演示核验；配置 API 后可联网查证。':'事实核验完成，来源已保存。')
    }catch(e){ctx.setToast(`事实核验失败：${e.message}`)}finally{setBusy('')}
  }

  async function manualVerify(index){
    const current=(ctx.factCheck.items||[])[index]
    if(!current||current.status==='contradicted'){ctx.setToast('有冲突的事实不能直接人工放行：请先修改正文或证据，再重新核验。');return}
    const ok=window.confirm('确认你已经实际查看来源/独立核对这条事实，并愿意以人工判断放行？')
    if(!ok)return
    const next={...ctx.factCheck,items:(ctx.factCheck.items||[]).map((item,i)=>i===index?{...item,status:'manual_verified',verdict:`${item.verdict}（已由你人工确认）`}:item)}
    ctx.setFactCheck(next)
    try{await saveFactCheck(ctx.activeContentId,next);ctx.setToast('已记录人工确认。')}catch(e){ctx.setToast(`保存人工确认失败：${e.message}`)}
  }

  async function makeCards(){
    if(!ctx.draft||!ctx.activeContentId) return
    setBusy('cards')
    try{
      const saved=await ctx.saveEditor(ctx.factCheck?'FACT_CHECK':'DRAFT_READY','manual_save')
      if(!saved) return
      const title=ctx.draft.titles?.[ctx.selectedTitle] || ctx.activeTopic.title
      const x=await generateCardPlan({topic:ctx.activeTopic.title,title,body:ctx.draft.body,card_count:6})
      ctx.setCardPlan(x.data)
      await saveCardPlan(saved.id,x.data)
      ctx.setToast('3:4 卡片方案已生成。')
    }catch(e){ctx.setToast(`卡片生成失败：${e.message}`)}finally{setBusy('')}
  }

  async function exportCards(){
    if(!ctx.cardPlan?.cards?.length) return
    setBusy('export')
    try{
      const blobs=await renderPlanToBlobs(ctx.cardPlan.cards)
      if(supabaseConfigured){
        await uploadCardBlobs(ctx.activeContentId,blobs)
        ctx.setToast(`已生成并保存 ${blobs.length} 张 1080×1440 PNG 到私有素材库。`)
      }else{
        blobs.forEach((blob,i)=>downloadBlob(blob,`content-os-card-${String(i+1).padStart(2,'0')}.png`))
        ctx.setToast(`已生成 ${blobs.length} 张 PNG；演示模式直接下载到本机。`)
      }
    }catch(e){ctx.setToast(`PNG 生成失败：${e.message}`)}finally{setBusy('')}
  }

  if(!ctx.activeTopic) return <>
    <section className="pageHero"><div><span className="kicker">EDITOR</span><h1>从一个判断，到一篇可以发的内容。</h1></div></section>
    <section className="panel emptyEditor"><h2>还没有打开选题</h2><p>从选题池采用一个题目，或者现在直接输入。</p><div className="inlineCreate"><input value={manual} onChange={e=>setManual(e.target.value)} placeholder="例如：北邮和985怎么选"/><button className="darkMini" onClick={()=>{ctx.manualTopic(manual);setManual('')}}>开始</button></div></section>
    <section className="panel"><SectionHead title="最近草稿"/>{ctx.contents.slice(0,6).map(item=><ContentRow key={item.id} item={item} onClick={()=>ctx.openContent(item.id)}/>)}</section>
  </>

  return <>
    <section className="pageHero editorHero"><div><span className="kicker">EDITOR</span><h1>{ctx.activeTopic.title}</h1><p>{statusLabel(ctx.contents.find(x=>x.id===ctx.activeContentId)?.status || (ctx.brief?'BRIEF_READY':'SELECTED'))}</p></div><button className="ghost compact" onClick={()=>ctx.openTopic(ctx.activeTopic)}>重置</button></section>

    {!ctx.brief && <section className="panel focusPanel"><div className="step">01 · CONTENT BRIEF</div><p className="lead">先让 AI 拆清楚目标读者、核心冲突、观点和需要核验的事实，再写正文。</p><button className="primary wide" onClick={makeBriefViaParent} disabled={busy==='brief'}>{busy==='brief'?'正在策划…':'生成 Content Brief'}</button></section>}

    {ctx.brief && <section className="panel"><div className="step">01 · CONTENT BRIEF</div>
      <Field label="目标读者" value={ctx.brief.target_audience} onChange={v=>ctx.setBrief({...ctx.brief,target_audience:v})}/>
      <div className="grid2"><Field label="内容目的" value={ctx.brief.purpose} onChange={v=>ctx.setBrief({...ctx.brief,purpose:v})}/><Field label="内容类型" value={ctx.brief.content_type} onChange={v=>ctx.setBrief({...ctx.brief,content_type:v})}/></div>
      <Field label="核心冲突" value={ctx.brief.core_conflict} onChange={v=>ctx.setBrief({...ctx.brief,core_conflict:v})}/>
      <Field label="核心观点" value={ctx.brief.thesis} onChange={v=>ctx.setBrief({...ctx.brief,thesis:v})} area/>
      <Field label="读者看完得到什么" value={ctx.brief.reader_takeaway} onChange={v=>ctx.setBrief({...ctx.brief,reader_takeaway:v})} area/>
      <Field label="你的独特角度" value={ctx.brief.creator_angle} onChange={v=>ctx.setBrief({...ctx.brief,creator_angle:v})} area/>
      <ListEditor label="文章结构" items={ctx.brief.outline} onChange={v=>ctx.setBrief({...ctx.brief,outline:v})}/>
      <ListEditor label="待核验事实" items={ctx.brief.facts_to_verify} onChange={v=>ctx.setBrief({...ctx.brief,facts_to_verify:v})} warning/>
      <ListEditor label="风险提醒" items={ctx.brief.risk_flags} onChange={v=>ctx.setBrief({...ctx.brief,risk_flags:v})} warning/>
      {!ctx.draft && <button className="primary wide" onClick={makeDraft} disabled={!canDraft}>{busy==='draft'?'正在写稿…':'按这个 Brief 生成成稿'}</button>}
    </section>}

    {ctx.draft && <section className="panel"><div className="step">02 · 审稿</div><label>标题候选</label><div className="titles">{ctx.draft.titles.map((t,i)=><button key={i} className={`titleChoice ${ctx.selectedTitle===i?'selected':''}`} onClick={()=>{ctx.setSelectedTitle(i);ctx.setEditorialReview(null);ctx.setFactCheck(null);ctx.setNativeTextPlan(null);ctx.setCardPlan(null)}}>{t||`标题 ${i+1}`}</button>)}</div>
      <label>正文</label><textarea className="bodyEditor" rows="18" value={ctx.draft.body} onChange={e=>{ctx.setDraft({...ctx.draft,body:e.target.value});ctx.setEditorialReview(null);ctx.setFactCheck(null);ctx.setNativeTextPlan(null);ctx.setCardPlan(null)}}/>
      <label>标签</label><input value={(ctx.draft.tags||[]).join(' ')} onChange={e=>ctx.setDraft({...ctx.draft,tags:e.target.value.split(/\s+/).filter(Boolean)})}/>
      <div className="factBox"><strong>AI 标出的待核验事实</strong>{ctx.draft.factual_claims?.length?ctx.draft.factual_claims.map((x,i)=><div key={i}>⚠️ {x}</div>):<div>暂无明显事实项</div>}</div>
      <div className="reviewActions"><button className="ghost" onClick={()=>ctx.saveEditor('REVIEW','manual_save')}>保存版本</button><button className="primary" onClick={reviewDraft} disabled={busy==='review'}>{busy==='review'?'总编复核中…':'重新总编审稿'}</button></div>
    </section>}

    {ctx.draft && <section className="panel editorialReviewPanel"><div className="step">03 · EDITORIAL REVIEW</div>
      {!ctx.editorialReview?<div className="checkEmpty"><p>这一步专门检查 AI 味、逻辑跳跃、过度营销和家长最可能反驳的点。默认使用独立的“升学决策·克制判断型”，不会照搬旧职场文风。</p><button className="primary wide" onClick={reviewDraft} disabled={busy==='review'}>{busy==='review'?'总编复核中…':'运行总编审稿'}</button></div>:<>
        <div className="editorialScoreGrid"><Stat value={Math.round(ctx.editorialReview.overall_score)} label="总编分"/><Stat value={Math.round(ctx.editorialReview.human_voice_score)} label="真人感"/><Stat value={Math.round(ctx.editorialReview.trust_score)} label="信任"/><Stat value={Math.round(ctx.editorialReview.ai_tell_score)} label="AI味↓"/></div>
        <div className={`editorialReady ${ctx.editorialReview.publish_ready?'ready':'hold'}`}><strong>{ctx.editorialReview.publish_ready?'可进入发布前核验':'建议继续修改'}</strong><span>{ctx.editorialReview.strongest_point}</span></div>
        {!!ctx.editorialReview.ai_tells?.length&&<ListRead title="AI味提示" items={ctx.editorialReview.ai_tells}/>}
        {!!ctx.editorialReview.logic_gaps?.length&&<ListRead title="逻辑缺口" items={ctx.editorialReview.logic_gaps}/>}
        {!!ctx.editorialReview.objections?.length&&<ListRead title="家长可能反驳" items={ctx.editorialReview.objections}/>}
        <button className="ghost wide" onClick={reviewDraft} disabled={busy==='review'}>重新总编审稿</button>
      </>}
    </section>}

    {ctx.draft && <section className="panel"><div className="step">04 · 事实与合规</div>
      {!ctx.factCheck ? <div className="checkEmpty"><p>发布前建议先核验具体分数、位次、招生规则、保研率、就业率等客观事实。</p><button className="primary wide" onClick={checkFacts} disabled={busy==='facts'}>{busy==='facts'?'正在联网核验…':'开始事实核验'}</button></div> : <>
        <div className="factSummary"><strong>{ctx.factCheck.summary}</strong><span>{ctx.factCheck.searched_web?'已使用联网搜索':'未联网 / 无需搜索'}</span></div>
        <div className="factResults">{(ctx.factCheck.items||[]).map((item,i)=><article className={`factResult ${item.status}`} key={`${item.claim}-${i}`}>
          <div className="factResultTop"><span className="statusPill">{factStatusLabel(item.status)}</span><b>{item.claim}</b></div>
          <p>{item.verdict}</p>
          {item.sources?.length>0 && <div className="sourceList">{item.sources.map((src,j)=><a key={j} href={src.url} target="_blank" rel="noreferrer"><span>{src.source_type==='official'?'官方':'来源'}</span>{src.title||src.publisher||src.url}</a>)}</div>}
          {item.status==='needs_review' && <button className="tiny" onClick={()=>manualVerify(i)}>我已查看来源并人工确认</button>}
          {item.status==='contradicted' && <div className="tinyNote">有冲突：请修改正文/证据后重新核验，不能直接放行。</div>}
        </article>)}</div>
        {(ctx.factCheck.compliance_flags||[]).length>0 && <div className="complianceBox"><strong>合规提醒</strong>{ctx.factCheck.compliance_flags.map((flag,i)=><div className={`complianceItem ${flag.severity}`} key={i}><b>{flag.text}</b>{flag.suggestion&&<span>{flag.suggestion}</span>}</div>)}</div>}
        <button className="ghost wide" onClick={checkFacts} disabled={busy==='facts'}>重新核验</button>
      </>}
    </section>}

    {ctx.draft && <section className="panel nativeTextPanel"><div className="step">05 · 小红书原生文转图</div>
      {!ctx.nativeTextPlan?<div className="checkEmpty"><p>默认优先使用小红书自己的“文字配图/文转图”，保留平台原生视觉。系统负责把正文整理成适合自动分页的输入稿，并给出模板建议。</p><button className="primary wide" onClick={makeNativeText} disabled={busy==='native'}>{busy==='native'?'正在整理…':'生成原生文转图发布包'}</button></div>:<>
        <div className="nativeMeta"><div><span>推荐模板</span><strong>{ctx.nativeTextPlan.recommended_style}</strong></div><div><span>预计页数</span><strong>{ctx.nativeTextPlan.expected_pages}</strong></div><div><span>备选</span><strong>{(ctx.nativeTextPlan.fallback_styles||[]).join(' / ')}</strong></div></div>
        <p className="muted">{ctx.nativeTextPlan.style_reason}</p>
        <textarea rows="12" value={ctx.nativeTextPlan.input_text} readOnly/>
        <div className="reviewActions"><button className="ghost" onClick={makeNativeText} disabled={busy==='native'}>重新整理</button><button className="primary" onClick={copyNativeText}>复制文转图稿</button></div>
        <p className="tinyNote">以后接 Mac Publisher 后，这个发布包可以直接驱动：上传图文 → 文字配图 → 生成图片 → 选模板 → 下一步 → 发布。当前没有电脑也不影响先生成和保存发布包。</p>
      </>}
    </section>}

    {ctx.draft && <section className="panel"><div className="step">05B · 自制 3:4 卡片（备用）</div>
      {!ctx.cardPlan?.cards?.length ? <div className="checkEmpty"><p>如果原生文转图效果不理想，再用自制 1080×1440 卡片。它现在是备用方案，不是默认。</p><button className="ghost wide" onClick={makeCards} disabled={busy==='cards'}>{busy==='cards'?'正在拆卡片…':'生成 6 张备用卡片'}</button></div> : <>
        <div className="cardPreviewRail">{ctx.cardPlan.cards.map((card,i)=><CardPreview card={card} index={i} total={ctx.cardPlan.cards.length} key={i}/>)}</div>
        <div className="reviewActions"><button className="ghost" onClick={makeCards} disabled={busy==='cards'}>重新生成</button><button className="primary" onClick={exportCards} disabled={busy==='export'}>{busy==='export'?'正在生成 PNG…':supabaseConfigured?'生成 PNG 并存素材库':'生成并下载 PNG'}</button></div>
      </>}
    </section>}

    {ctx.draft && <RepurposePanel ctx={ctx}/>}

    {ctx.draft && <section className="panel approvalPanel"><div className="step">07 · 你的最终审核</div><p className="lead">AI 已完成选题、成稿、总编复核、事实检查和发布形态整理。你只负责最后判断：观点是不是你认可的、这篇能不能发。</p><div className="reviewActions"><button className="ghost" onClick={()=>ctx.saveEditor('REVIEW','manual_save')}>保存版本</button><button className="approve" onClick={ctx.approve}>✓ 审核通过</button></div></section>}

    {ctx.activeContentId && <section className="panel"><SectionHead title={`版本历史 · ${ctx.versions.length}`}/>{ctx.versions.length===0?<Empty text="还没有历史版本。"/>:ctx.versions.slice(0,10).map(v=><div className="versionRow" key={v.id}><div><strong>v{v.version}</strong><span>{reasonLabel(v.reason)} · {formatTime(v.created_at)}</span></div><button onClick={()=>ctx.restoreVersion(v)}>载入</button></div>)}</section>}
  </>
}

function AssetHub({ctx}){
  const [section,setSection]=useState('bridge')
  return <>
    <section className="pageHero"><div><span className="kicker">CREATOR ASSETS</span><h1>把经验、客户和 AI 工作流沉淀下来。</h1></div></section>
    <div className="assetTabs">
      <button className={section==='bridge'?'active':''} onClick={()=>setSection('bridge')}>AI桥</button>
      <button className={section==='opinions'?'active':''} onClick={()=>setSection('opinions')}>观点</button>
      <button className={section==='knowledge'?'active':''} onClick={()=>setSection('knowledge')}>案例库</button>
      <button className={section==='leads'?'active':''} onClick={()=>setSection('leads')}>客户</button>
      <button className={section==='analytics'?'active':''} onClick={()=>setSection('analytics')}>归因</button>
      <button className={section==='system'?'active':''} onClick={()=>setSection('system')}>系统</button>
    </div>
    {section==='bridge'&&<AiBridge ctx={ctx}/>}
    {section==='opinions'&&<OpinionLibrary ctx={ctx} embedded/>}
    {section==='knowledge'&&<KnowledgeLibrary ctx={ctx}/>}
    {section==='leads'&&<LeadCRM ctx={ctx}/>}
    {section==='analytics'&&<AttributionPanel ctx={ctx}/>}
    {section==='system'&&<SystemPanel ctx={ctx}/>}
  </>
}

function OpinionLibrary({ctx,embedded=false}){
  const [form,setForm]=useState(blankOpinion)
  const [busy,setBusy]=useState(false)

  function edit(item){setForm({...blankOpinion,...item,tags:item.tags||[]});window.scrollTo({top:0,behavior:'smooth'})}
  async function submit(){
    if(form.title.trim().length<2||form.viewpoint.trim().length<2) return
    setBusy(true)
    try{await saveOpinion(form);setForm(blankOpinion);await ctx.refresh();ctx.setToast('观点已保存，后续 AI 策划与写稿会使用它。')}catch(e){ctx.setToast(`保存观点失败：${e.message}`)}finally{setBusy(false)}
  }
  async function remove(id){
    try{await deleteOpinion(id);await ctx.refresh();if(form.id===id)setForm(blankOpinion)}catch(e){ctx.setToast(`删除失败：${e.message}`)}
  }

  return <>
    {!embedded&&<section className="pageHero"><div><span className="kicker">OPINION LIBRARY</span><h1>让 AI 学你的判断，不是学“网感”。</h1></div></section>}
    <section className="panel">
      <div className="step">{form.id?'编辑观点':'新增观点'}</div>
      <Field label="观点标题" value={form.title} onChange={v=>setForm({...form,title:v})}/>
      <Field label="你的判断" value={form.viewpoint} onChange={v=>setForm({...form,viewpoint:v})} area/>
      <Field label="为什么" value={form.reasoning} onChange={v=>setForm({...form,reasoning:v})} area/>
      <Field label="例外 / 边界条件" value={form.exceptions} onChange={v=>setForm({...form,exceptions:v})} area/>
      <Field label="语气提醒" value={form.tone_note} onChange={v=>setForm({...form,tone_note:v})} placeholder="例如：不要说‘千万别学’，强调适用条件"/>
      <Field label="标签（空格分隔）" value={(form.tags||[]).join(' ')} onChange={v=>setForm({...form,tags:v.split(/\s+/).filter(Boolean)})}/>
      <label className="checkRow"><input type="checkbox" checked={form.is_pinned} onChange={e=>setForm({...form,is_pinned:e.target.checked})}/><span>置顶：优先提供给 AI</span></label>
      <div className="reviewActions"><button className="ghost" onClick={()=>setForm(blankOpinion)}>清空</button><button className="primary" disabled={busy} onClick={submit}>{busy?'保存中…':'保存观点'}</button></div>
    </section>
    <section className="panel"><SectionHead title={`我的观点 · ${ctx.opinions.length}`}/>{ctx.opinions.length===0?<Empty text="先写下 3～5 个你最坚定的升学判断。"/>:ctx.opinions.map(op=><article className="opinionCard" key={op.id}><div className="opinionTop"><div>{op.is_pinned&&<span className="pin">置顶</span>}<strong>{op.title}</strong></div><div><button onClick={()=>edit(op)}>编辑</button><button className="dangerText" onClick={()=>remove(op.id)}>删除</button></div></div><p className="viewpoint">{op.viewpoint}</p>{op.reasoning&&<p><b>为什么：</b>{op.reasoning}</p>}{op.exceptions&&<p><b>边界：</b>{op.exceptions}</p>}</article>)}</section>
  </>
}

function KnowledgeLibrary({ctx}){
  const [form,setForm]=useState(blankKnowledge)
  const [busy,setBusy]=useState(false)
  function edit(item){setForm({...blankKnowledge,...item,tags:item.tags||[]});window.scrollTo({top:0,behavior:'smooth'})}
  async function submit(){
    if(form.title.trim().length<2)return
    setBusy(true)
    try{await saveKnowledgeItem(form);setForm(blankKnowledge);await ctx.refresh();ctx.setToast('知识条目已保存。标记为敏感的内容不会进入手动 AI 任务包。')}catch(e){ctx.setToast(`保存失败：${e.message}`)}finally{setBusy(false)}
  }
  async function remove(id){try{await deleteKnowledgeItem(id);await ctx.refresh();if(form.id===id)setForm(blankKnowledge)}catch(e){ctx.setToast(`删除失败：${e.message}`)}}
  return <>
    <section className="panel"><div className="step">案例 / 框架 / 经验</div>
      <div className="grid2"><div className="field"><label>类型</label><select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}><option value="case">脱敏案例</option><option value="framework">决策框架</option><option value="note">经验笔记</option><option value="source">资料摘记</option></select></div><Field label="标题" value={form.title} onChange={v=>setForm({...form,title:v})}/></div>
      <Field label="一句话摘要" value={form.summary} onChange={v=>setForm({...form,summary:v})}/>
      <Field label="详细内容" value={form.content} onChange={v=>setForm({...form,content:v})} area placeholder="案例务必脱敏；记录分数段、家庭目标、冲突、你的判断与结果。"/>
      <Field label="标签（空格分隔）" value={(form.tags||[]).join(' ')} onChange={v=>setForm({...form,tags:v.split(/\s+/).filter(Boolean)})}/>
      <label className="checkRow"><input type="checkbox" checked={Boolean(form.is_sensitive)} onChange={e=>setForm({...form,is_sensitive:e.target.checked})}/><span>敏感：不自动带入 ChatGPT/Codex 任务包</span></label>
      <div className="reviewActions"><button className="ghost" onClick={()=>setForm(blankKnowledge)}>清空</button><button className="primary" disabled={busy} onClick={submit}>{busy?'保存中…':'保存到知识库'}</button></div>
    </section>
    <section className="panel"><SectionHead title={`知识资产 · ${ctx.knowledge.length}`}/>{ctx.knowledge.length===0?<Empty text="先把过去做过的典型案例和决策框架写进来。"/>:ctx.knowledge.map(item=><article className="knowledgeCard" key={item.id}><div className="opinionTop"><div><span className="typePill">{knowledgeKindLabel(item.kind)}</span>{item.is_sensitive&&<span className="sensitivePill">敏感</span>}<strong>{item.title}</strong></div><div><button onClick={()=>edit(item)}>编辑</button><button className="dangerText" onClick={()=>remove(item.id)}>删除</button></div></div>{item.summary&&<p className="viewpoint">{item.summary}</p>}<p>{(item.content||'').slice(0,240)}{(item.content||'').length>240?'…':''}</p></article>)}</section>
  </>
}

function LeadCRM({ctx}){
  const [form,setForm]=useState(blankLead)
  const [busy,setBusy]=useState(false)
  const won=ctx.leads.filter(x=>x.stage==='won')
  const pipeline=ctx.leads.filter(x=>!['won','lost'].includes(x.stage)).reduce((a,x)=>a+Number(x.estimated_value||0),0)
  const revenue=won.reduce((a,x)=>a+Number(x.actual_value||0),0)
  function edit(item){setForm({...blankLead,...item,next_followup_date:item.next_followup_date||''});window.scrollTo({top:0,behavior:'smooth'})}
  async function submit(){setBusy(true);try{await saveLead(form);setForm(blankLead);await ctx.refresh();ctx.setToast('家长线索已保存。')}catch(e){ctx.setToast(`保存线索失败：${e.message}`)}finally{setBusy(false)}}
  async function remove(id){try{await deleteLead(id);await ctx.refresh();if(form.id===id)setForm(blankLead)}catch(e){ctx.setToast(`删除失败：${e.message}`)}}
  return <>
    <div className="statGrid crmStats"><Stat value={ctx.leads.length} label="总线索"/><Stat value={ctx.leads.filter(x=>x.stage==='qualified').length} label="有效线索"/><Stat value={`¥${Math.round(pipeline/1000)}k`} label="预计管道"/><Stat value={`¥${Math.round(revenue/1000)}k`} label="已成交"/></div>
    <section className="panel"><div className="step">记录一个家长线索</div><p className="tinyNote">隐私默认最小化：这里只记匿名代号和决策需求。不要保存身份证号、考生号、准考证号、账号密码或验证码。</p>
      <div className="grid2"><Field label="称呼 / 匿名代号" value={form.name_alias} onChange={v=>setForm({...form,name_alias:v})} placeholder="如：海淀高三A家长"/><div className="field"><label>阶段</label><select value={form.stage} onChange={e=>setForm({...form,stage:e.target.value})}>{['new','contacted','qualified','consulted','won','lost'].map(x=><option key={x} value={x}>{leadStageLabel(x)}</option>)}</select></div></div>
      <div className="grid2"><Field label="年级" value={form.grade} onChange={v=>setForm({...form,grade:v})} placeholder="高三"/><Field label="分数 / 位次区间" value={form.score_range} onChange={v=>setForm({...form,score_range:v})} placeholder="620-640"/></div>
      <Field label="核心需求" value={form.need} onChange={v=>setForm({...form,need:v})} area/>
      <div className="grid2"><Field label="来源渠道" value={form.source_channel} onChange={v=>setForm({...form,source_channel:v})}/><Field label="来源笔记 / 备注" value={form.source_note} onChange={v=>setForm({...form,source_note:v})}/></div>
      <div className="field"><label>归因到哪篇已发布笔记（可选）</label><select value={form.source_post_id||''} onChange={e=>setForm({...form,source_post_id:e.target.value})}><option value="">未绑定</option>{ctx.posts.map(p=><option key={p.id} value={p.id}>{postLabel(p)}</option>)}</select></div>
      <div className="grid2"><Field label="预计客单" value={form.estimated_value} onChange={v=>setForm({...form,estimated_value:v})}/><Field label="实际成交" value={form.actual_value} onChange={v=>setForm({...form,actual_value:v})}/></div>
      <div className="grid2"><Field label="下一步" value={form.next_action} onChange={v=>setForm({...form,next_action:v})}/><div className="field"><label>下次跟进</label><input type="date" value={form.next_followup_date||''} onChange={e=>setForm({...form,next_followup_date:e.target.value})}/></div></div>
      <Field label="联系备注（建议只写“已加微信/待回访”等状态）" value={form.contact_note} onChange={v=>setForm({...form,contact_note:v})} area/>
      <div className="reviewActions"><button className="ghost" onClick={()=>setForm(blankLead)}>清空</button><button className="primary" disabled={busy} onClick={submit}>{busy?'保存中…':'保存线索'}</button></div>
    </section>
    <section className="panel"><SectionHead title={`线索 · ${ctx.leads.length}`}/>{ctx.leads.length===0?<Empty text="以后每个有效私信都记下来，最终才能知道哪类内容真正带来成交。"/>:ctx.leads.map(lead=><article className="leadCard" key={lead.id}><div className="leadTop"><div><span className={`leadStage ${lead.stage}`}>{leadStageLabel(lead.stage)}</span><strong>{lead.name_alias||'未命名家长'}</strong></div><div><button onClick={()=>edit(lead)}>编辑</button><button className="dangerText" onClick={()=>remove(lead.id)}>删除</button></div></div><p>{lead.grade} {lead.score_range} · {lead.need||'未记录需求'}</p><small>{lead.source_channel}{lead.source_note?` · ${lead.source_note}`:''}{lead.next_action?` · 下一步：${lead.next_action}`:''}</small></article>)}</section>
  </>
}


function SystemPanel({ctx}){
  const research=ctx.xhsAccounts.find(x=>x.role==='research')||{alias:'研究小号',role:'research',profile_key:'xhs-research',enabled:true,status:'not_connected',risk_state:'normal',notes:''}
  const publisher=ctx.xhsAccounts.find(x=>x.role==='publisher')||{alias:'发布大号',role:'publisher',profile_key:'xhs-publisher',enabled:true,status:'not_connected',risk_state:'normal',notes:''}
  const [researchForm,setResearchForm]=useState(research)
  const [publisherForm,setPublisherForm]=useState(publisher)
  const budget=ctx.preferences?.config?.api_budget||{mode:'lean',monthly_limit_usd:5,web_runs_per_request:2}
  const researchCfg=ctx.preferences?.config?.xhs_research||{queries_per_run:8,min_interval_minutes:120}
  const [budgetForm,setBudgetForm]=useState(budget)
  const [collectorForm,setCollectorForm]=useState(researchCfg)
  const styleCfg=ctx.preferences?.config?.editorial_style||{name:'升学决策·克制判断型',notes:DEFAULT_EDITORIAL_STYLE}
  const nativeCfg=ctx.preferences?.config?.xhs_native_text||{enabled:true,preferred_style:'简约',fallback_styles:['备忘','基础']}
  const [styleForm,setStyleForm]=useState(styleCfg)
  const [nativeForm,setNativeForm]=useState(nativeCfg)
  const [busy,setBusy]=useState(false)
  const [serverReady,setServerReady]=useState(null)
  const [usage,setUsage]=useState(null)
  useEffect(()=>{setResearchForm(research);setPublisherForm(publisher)},[ctx.xhsAccounts.length])
  useEffect(()=>{getReady().then(setServerReady).catch(()=>setServerReady(null));getAiUsage().then(setUsage).catch(()=>setUsage(null))},[])

  async function saveAccounts(){
    setBusy(true)
    try{
      await saveXhsAccount({...researchForm,role:'research'})
      await saveXhsAccount({...publisherForm,role:'publisher'})
      const nextConfig={...(ctx.preferences?.config||{}),api_budget:{...budgetForm,monthly_limit_usd:Number(budgetForm.monthly_limit_usd||5),web_runs_per_request:Number(budgetForm.web_runs_per_request||2)},xhs_research:{...collectorForm,queries_per_run:Number(collectorForm.queries_per_run||8),min_interval_minutes:Number(collectorForm.min_interval_minutes||120)},editorial_style:{...styleForm,name:styleForm.name||'升学决策·克制判断型',notes:styleForm.notes||DEFAULT_EDITORIAL_STYLE},xhs_native_text:{...nativeForm,enabled:true,fallback_styles:['备忘','基础']}}
      const next=await savePreferences({...(ctx.preferences||{}),config:nextConfig})
      ctx.setPreferences(next);await ctx.refresh();ctx.setToast('双号角色与 API 预算策略已保存。')
    }catch(e){ctx.setToast(`保存失败：${e.message}`)}finally{setBusy(false)}
  }
  return <>
    <section className="panel"><div className="step">小红书双号隔离</div><p className="lead">研究小号只负责搜索/热点观察；发布大号只负责正式发帖。两套浏览器 Profile 和登录态必须隔离，云端只保存“账号别名和角色”，不保存 Cookie/密码。</p>
      <div className="accountGrid">
        <article className="accountCard research"><span className="typePill">RESEARCH</span><Field label="小号别名" value={researchForm.alias} onChange={v=>setResearchForm({...researchForm,alias:v})}/><Field label="本地 Profile 标识" value={researchForm.profile_key} onChange={v=>setResearchForm({...researchForm,profile_key:v})}/><Field label="备注" value={researchForm.notes} onChange={v=>setResearchForm({...researchForm,notes:v})} area/><small>只读研究：搜索、热榜、公开笔记主题。不得自动互动、绕验证码或逆向私有接口。</small></article>
        <article className="accountCard publisher"><span className="typePill">PUBLISHER</span><Field label="大号别名" value={publisherForm.alias} onChange={v=>setPublisherForm({...publisherForm,alias:v})}/><Field label="本地 Profile 标识" value={publisherForm.profile_key} onChange={v=>setPublisherForm({...publisherForm,profile_key:v})}/><Field label="备注" value={publisherForm.notes} onChange={v=>setPublisherForm({...publisherForm,notes:v})} area/><small>只做发布。未来 Mac Publisher 默认拒绝使用 research 角色账号。</small></article>
      </div>
    </section>
    <section className="panel"><div className="step">升学内容风格（独立于旧职场号）</div><p className="lead">不拿旧职场文章做强制模仿。这里定义一套单独的升学咨询风格，后续只用新账号数据慢慢校准。</p><Field label="风格名称" value={styleForm.name} onChange={v=>setStyleForm({...styleForm,name:v})}/><Field label="总编规则" value={styleForm.notes} onChange={v=>setStyleForm({...styleForm,notes:v})} area/><div className="field"><label>小红书原生文转图首选模板</label><select value={nativeForm.preferred_style||'简约'} onChange={e=>setNativeForm({...nativeForm,preferred_style:e.target.value})}>{['简约','备忘','基础','便签','边框','插图','涂写','弥散','光影','科技'].map(x=><option value={x} key={x}>{x}</option>)}</select></div><p className="tinyNote">默认优先简约/备忘/基础：文字可读性高，也更接近你过去那种“原生分享”而不是机构海报。</p></section>
    <section className="panel"><div className="step">API 成本策略 · Lean</div><p className="lead">默认 Luna 做扫描/排序/总编复核/文转图整理，Terra 只负责 Brief 和正式写稿，Sol 不自动启用。V0.9 后端新增真正的月度硬预算与调用账本；达到后 API 会直接拒绝继续花费，而不是静默退回假数据。</p>
      {serverReady&&<div className="runtimeStatus"><span>环境 <b>{serverReady.app_env}</b></span><span>AI <b>{serverReady.ai}</b></span><span>Mock fallback <b>{serverReady.mock_fallback?'ON':'OFF'}</b></span></div>}
      {usage&&<div className="usageBox"><div><span>本月 API 估算</span><strong>${Number(usage.month_spend_usd||0).toFixed(4)}</strong></div><div><span>后端硬上限</span><strong>{usage.budget_enabled?`$${Number(usage.monthly_budget_usd||0).toFixed(2)}`:'未启用'}</strong></div><div><span>剩余额度</span><strong>{usage.remaining_usd==null?'—':`$${Number(usage.remaining_usd).toFixed(4)}`}</strong></div></div>}
      <div className="grid2"><Field label="内容策略预算目标（USD，仅界面参考）" value={budgetForm.monthly_limit_usd} onChange={v=>setBudgetForm({...budgetForm,monthly_limit_usd:v})}/><Field label="单次联网最大搜索次数" value={budgetForm.web_runs_per_request} onChange={v=>setBudgetForm({...budgetForm,web_runs_per_request:v})}/></div>
      <div className="grid2"><Field label="研究号每轮关键词数" value={collectorForm.queries_per_run} onChange={v=>setCollectorForm({...collectorForm,queries_per_run:v})}/><Field label="自动研究最短间隔（分钟）" value={collectorForm.min_interval_minutes} onChange={v=>setCollectorForm({...collectorForm,min_interval_minutes:v})}/></div>
      {ctx.aiPolicy?.policies?.length>0&&<div className="policyList">{ctx.aiPolicy.policies.map(p=><div className="policyRow" key={p.task}><strong>{taskLabel(p.task)}</strong><span>{p.model}</span><small>{p.max_tool_calls?`最多 ${p.max_tool_calls} 次联网搜索`:'不联网'}</small></div>)}</div>}
      <button className="primary wide" disabled={busy} onClick={saveAccounts}>{busy?'保存中…':'保存系统策略'}</button>
      <p className="tinyNote">后端硬预算由 API 环境变量 OPENAI_MONTHLY_BUDGET_USD 控制；这里的“内容策略预算目标”不会绕过后端上限。角色隔离是为了降低操作耦合和误触风险，不代表可以绕过平台规则。</p>
    </section>
    <section className="panel"><SectionHead title={`研究运行记录 · ${ctx.researchRuns.length}`}/>{ctx.researchRuns.length===0?<Empty text="以后接 Mac Research Collector 后，每次站内搜索会在这里留下运行记录。"/>:ctx.researchRuns.slice(0,10).map(r=><div className="versionRow" key={r.id}><div><strong>{r.run_type}</strong><span>{r.status} · {r.query_count} 个查询 → {r.signal_count} 条信号 · {formatTime(r.created_at)}</span></div></div>)}</section>
  </>
}

function AttributionPanel({ctx}){
  const [postForm,setPostForm]=useState({content_id:'',external_url:'',published_at:new Date().toISOString().slice(0,16)})
  const [metricForm,setMetricForm]=useState({post_id:'',views:0,likes:0,saves:0,comments:0,followers_gained:0,profile_visits:0,dms:0,leads:0,consultations:0,revenue:0})
  const [busy,setBusy]=useState('')
  const latestByPost={}
  for(const m of ctx.metrics){if(!latestByPost[m.post_id])latestByPost[m.post_id]=m}
  const totalRevenue=ctx.leads.filter(x=>x.stage==='won').reduce((a,x)=>a+Number(x.actual_value||0),0)
  const totalLeads=ctx.leads.length
  const attributedLeads=ctx.leads.filter(x=>x.source_post_id).length

  async function addPost(){setBusy('post');try{await savePost({...postForm,published_at:postForm.published_at?new Date(postForm.published_at).toISOString():new Date().toISOString()});setPostForm({content_id:'',external_url:'',published_at:new Date().toISOString().slice(0,16)});await ctx.refresh();ctx.setToast('已记录发布笔记。')}catch(e){ctx.setToast(`记录笔记失败：${e.message}`)}finally{setBusy('')}}
  async function addMetric(){setBusy('metric');try{await saveMetric(metricForm);setMetricForm({...metricForm,views:0,likes:0,saves:0,comments:0,followers_gained:0,profile_visits:0,dms:0,leads:0,consultations:0,revenue:0});await ctx.refresh();ctx.setToast('表现数据已记录。')}catch(e){ctx.setToast(`保存数据失败：${e.message}`)}finally{setBusy('')}}

  return <>
    <div className="statGrid crmStats"><Stat value={ctx.posts.length} label="已发布笔记"/><Stat value={totalLeads} label="家长线索"/><Stat value={`${attributedLeads}/${totalLeads||0}`} label="已归因线索"/><Stat value={`¥${Math.round(totalRevenue/1000)}k`} label="成交额"/></div>
    <section className="panel"><div className="step">先记录一篇已发布笔记</div><div className="field"><label>对应 Content OS 内容</label><select value={postForm.content_id} onChange={e=>setPostForm({...postForm,content_id:e.target.value})}><option value="">未绑定</option>{ctx.contents.map(c=><option key={c.id} value={c.id}>{c.title||c.topics?.title||'未命名内容'}</option>)}</select></div><Field label="小红书公开链接（可选）" value={postForm.external_url} onChange={v=>setPostForm({...postForm,external_url:v})}/><div className="field"><label>发布时间</label><input type="datetime-local" value={postForm.published_at} onChange={e=>setPostForm({...postForm,published_at:e.target.value})}/></div><button className="primary wide" disabled={busy==='post'} onClick={addPost}>记录笔记</button></section>
    <section className="panel"><div className="step">记录一次表现快照</div><div className="field"><label>笔记</label><select value={metricForm.post_id} onChange={e=>setMetricForm({...metricForm,post_id:e.target.value})}><option value="">选择笔记</option>{ctx.posts.map(p=><option key={p.id} value={p.id}>{postLabel(p)}</option>)}</select></div><div className="metricGrid">{[['views','曝光'],['likes','点赞'],['saves','收藏'],['comments','评论'],['profile_visits','主页访问'],['dms','私信'],['leads','有效线索'],['consultations','咨询'],['followers_gained','涨粉'],['revenue','归因收入']].map(([k,label])=><Field key={k} label={label} value={metricForm[k]} onChange={v=>setMetricForm({...metricForm,[k]:v})}/>)}</div><button className="primary wide" disabled={busy==='metric'||!metricForm.post_id} onClick={addMetric}>保存快照</button></section>
    <section className="panel"><SectionHead title="内容 → 线索 → 成交"/>{ctx.posts.length===0?<Empty text="先记录你发出去的笔记。之后每隔 24h/72h 手动录一组数据就够。"/>:ctx.posts.map(p=>{const m=latestByPost[p.id];const leads=ctx.leads.filter(x=>x.source_post_id===p.id);const revenue=leads.reduce((a,x)=>a+Number(x.actual_value||0),0);return <article className="attributionCard" key={p.id}><div className="leadTop"><div><strong>{postLabel(p)}</strong><span>{formatTime(p.published_at)}</span></div><b>¥{Math.round(revenue)}</b></div><div className="scoreLine"><span>曝光 {m?.views||0}</span><span>收藏 {m?.saves||0}</span><span>私信 {m?.dms||0}</span><span>线索 {leads.length}</span></div>{m?.views>0&&<small>每万曝光线索：{(leads.length/m.views*10000).toFixed(2)} · 收藏率：{((m.saves||0)/m.views*100).toFixed(2)}%</small>}</article>})}</section>
  </>
}

function AiBridge({ctx}){
  const [prompt,setPrompt]=useState('')
  const [raw,setRaw]=useState('')
  const [busy,setBusy]=useState(false)

  async function setMode(value){
    try{const next=await savePreferences({...(ctx.preferences||{}),ai_mode:value});ctx.setPreferences(next);ctx.setToast(value==='manual'?'已切到零 API 手动 AI 模式。':'已切到 API 模式。')}catch(e){ctx.setToast(`保存设置失败：${e.message}`)}
  }
  async function makePrompt(){
    const text=buildDailyBridgePrompt({calendarItems:ctx.calendarItems,topics:ctx.topics,contents:ctx.contents,opinions:ctx.opinions,knowledge:ctx.knowledge,trendSignals:ctx.trendSignals})
    setPrompt(text)
    try{await saveBridgeRun({run_date:todayIso(),prompt:text,status:'prompt_ready',metadata:{mode:'manual_daily'}});await ctx.refresh()}catch{}
  }
  async function copyPrompt(){if(!prompt)await makePrompt();try{await navigator.clipboard.writeText(prompt||buildDailyBridgePrompt({calendarItems:ctx.calendarItems,topics:ctx.topics,contents:ctx.contents,opinions:ctx.opinions,knowledge:ctx.knowledge,trendSignals:ctx.trendSignals}));ctx.setToast('今日任务包已复制。去 ChatGPT/Codex 发这一条即可。')}catch(e){ctx.setToast(`复制失败：${e.message}`)}}
  async function importResult(){
    setBusy(true)
    try{
      const pkg=normalizeDailyPackage(extractJson(raw))
      let topic=ctx.topics.find(x=>x.title.trim()===pkg.topic.title.trim())
      if(!topic) topic=await createTopic({title:pkg.topic.title,raw_input:pkg.topic.title,purpose:pkg.topic.purpose,target_audience:pkg.topic.target_audience,content_type:'手动 AI Bridge',status:'SELECTED'})
      const saved=await saveContent({contentId:null,topicId:topic.id,selectedTitle:pkg.draft.titles[0],titleOptions:pkg.draft.titles,brief:pkg.brief,body:pkg.draft.body,tags:pkg.draft.tags,factualClaims:pkg.draft.factual_claims,factCheck:pkg.fact_check,cardPlan:pkg.card_plan,status:'FACT_CHECK',reason:'manual_ai_import'})
      await saveFactCheck(saved.id,pkg.fact_check)
      if(pkg.editorial_review) await saveEditorialReview(saved.id,pkg.editorial_review)
      if(pkg.native_text_plan) await saveNativeTextPlan(saved.id,pkg.native_text_plan)
      if(pkg.card_plan?.cards?.length) await saveCardPlan(saved.id,pkg.card_plan)
      if(pkg.repurpose?.length) await saveRepurposedOutputs(saved.id,pkg.repurpose)
      await saveBridgeRun({run_date:todayIso(),prompt:prompt||'',response_json:pkg,status:'imported',metadata:{content_id:saved.id}})
      await ctx.refresh();await ctx.openContent(saved.id);ctx.setToast('✓ 今日 AI 结果已导入：成稿、总编审稿、核验、原生文转图和复用版本都已落库。')
    }catch(e){ctx.setToast(`导入失败：${e.message}`)}finally{setBusy(false)}
  }
  return <>
    <section className="panel bridgeHero"><div className="bridgeMode"><div><span className="liveBadge">ZERO API</span><h2>每天只和 ChatGPT / Codex 说一次</h2></div><select value={ctx.preferences?.ai_mode||'manual'} onChange={e=>setMode(e.target.value)}><option value="manual">手动 AI（零 API）</option><option value="api">API 自动化</option></select></div><p className="muted">系统把今天的排期、选题、你的观点和非敏感案例压成一个任务包。复制出去发一条消息，再把 JSON 结果粘回来。</p><button className="primary wide" onClick={makePrompt}>生成今日任务包</button></section>
    {prompt&&<section className="panel"><SectionHead title="① 复制这一条给 ChatGPT / Codex"/><textarea className="bridgePrompt" rows="14" value={prompt} readOnly/><button className="primary wide" onClick={copyPrompt}>复制任务包</button></section>}
    <section className="panel"><SectionHead title="② 把 AI 返回的 JSON 粘回来"/><textarea rows="12" value={raw} onChange={e=>setRaw(e.target.value)} placeholder='粘贴 AI 返回的 {"topic": ... } JSON'/><button className="approve wide" disabled={busy||!raw.trim()} onClick={importResult}>{busy?'正在导入…':'导入今日内容包'}</button><p className="tinyNote">导入后仍然保留人工审核门禁。外部 AI 标记 verified 的事实会自动降级为“待人工”，必须点开来源确认后才能审核通过。</p></section>
    <section className="panel"><SectionHead title={`最近桥接 · ${ctx.bridgeRuns.length}`}/>{ctx.bridgeRuns.length===0?<Empty text="还没有桥接记录。"/>:ctx.bridgeRuns.slice(0,8).map(run=><div className="versionRow" key={run.id}><div><strong>{run.run_date}</strong><span>{run.status==='imported'?'已导入':'任务包已生成'} · {formatTime(run.created_at)}</span></div></div>)}</section>
  </>
}

function RepurposePanel({ctx}){
  const [outputs,setOutputs]=useState([])
  const [busy,setBusy]=useState(false)
  useEffect(()=>{if(ctx.activeContentId)listRepurposedOutputs(ctx.activeContentId).then(setOutputs).catch(()=>setOutputs([]));else setOutputs([])},[ctx.activeContentId])
  async function generate(){
    if(!ctx.activeContentId||!ctx.draft)return
    setBusy(true)
    try{const title=ctx.draft.titles?.[ctx.selectedTitle]||ctx.activeTopic.title;const x=await repurposeContent({topic:ctx.activeTopic.title,title,body:ctx.draft.body,channels:['video_script','wechat_moments','wechat_group']});const saved=await saveRepurposedOutputs(ctx.activeContentId,x.data.outputs);setOutputs(saved);ctx.setToast(x.mode==='mock'?'已生成演示复用版本；零 API 正式使用请从 AI 桥导入。':'已生成多平台复用版本。')}catch(e){ctx.setToast(`复用生成失败：${e.message}`)}finally{setBusy(false)}
  }
  async function copy(text){try{await navigator.clipboard.writeText(text);ctx.setToast('已复制。')}catch(e){ctx.setToast(`复制失败：${e.message}`)}}
  return <section className="panel"><div className="step">05 · 一稿多用</div><p className="lead">同一个核心判断拆成口播、朋友圈和家长群版本。零 API 模式下，今日 AI Bridge 会一次性生成并导入这些版本。</p>{outputs.length===0?<button className="ghost wide" onClick={generate} disabled={busy}>{busy?'生成中…':'API 生成（可选）'}</button>:<div className="repurposeList">{outputs.map(out=><article className="repurposeCard" key={out.channel}><div className="sectionHead"><h2>{channelLabel(out.channel)}</h2><button onClick={()=>copy(out.body)}>复制</button></div>{out.title&&<strong>{out.title}</strong>}<p>{out.body}</p>{out.notes&&<small>{out.notes}</small>}</article>)}</div>}</section>
}


function ListRead({title,items}){return <div className="listRead"><strong>{title}</strong>{(items||[]).map((x,i)=><p key={i}>• {x}</p>)}</div>}

function CardPreview({card,index,total}){
  return <div className={`cardPreview ${card.layout||'points'}`}><div className="cardMeta"><span>{card.eyebrow||'升学决策'}</span><span>{String(index+1).padStart(2,'0')} / {String(total).padStart(2,'0')}</span></div><h3>{card.headline}</h3><div className="cardPoints">{(card.body||[]).map((x,i)=><p key={i}><i></i><span>{x}</span></p>)}</div><footer>{card.footer||'O师 · 大学与专业选择'}</footer></div>
}

function ContentRow({item,onClick}){
  return <button className="contentRow" onClick={onClick}><div><strong>{item.title || item.topics?.title || '未命名草稿'}</strong><span>{statusLabel(item.status)} · v{item.version||1} · {formatTime(item.updated_at)}</span></div><b>›</b></button>
}
function Stat({value,label}){return <div className="stat"><b>{value}</b><span>{label}</span></div>}
function SectionHead({title,action,onAction}){return <div className="sectionHead"><h2>{title}</h2>{action&&<button onClick={onAction}>{action} →</button>}</div>}
function Empty({text}){return <div className="empty">{text}</div>}
function NavButton({active,onClick,icon,label}){return <button className={active?'active':''} onClick={onClick}><span>{icon}</span><small>{label}</small></button>}
function Centered({children}){return <main className="centered">{children}</main>}

function Field({label,value,onChange,area=false,placeholder=''}){
  return <div className="field"><label>{label}</label>{area?<textarea rows="3" value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>:<input value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>}</div>
}
function ListEditor({label,items,onChange,warning=false}){
  return <div className={`field ${warning?'warning':''}`}><label>{label}</label>{(items||[]).map((item,i)=><div className="listRow" key={i}><span>{warning?'⚠️':'•'}</span><input value={item} onChange={e=>{const next=[...items];next[i]=e.target.value;onChange(next)}}/><button onClick={()=>onChange(items.filter((_,j)=>j!==i))}>×</button></div>)}<button className="tiny" onClick={()=>onChange([...(items||[]),''])}>+ 添加一项</button></div>
}
function Toast({text,clear}){
  useEffect(()=>{const t=setTimeout(clear,3200);return()=>clearTimeout(t)},[text])
  return <div className="toast" onClick={clear}>{text}</div>
}
function factStatusLabel(x){return ({verified:'已验证',manual_verified:'人工确认',needs_review:'待人工',contradicted:'有冲突'})[x]||x}
function purposeLabel(x){return ({traffic:'流量型',decision:'决策型',trust:'信任型',professional:'专业型',conversion:'转化型'})[x]||x||'决策型'}
function statusLabel(x){return ({IDEA:'灵感',SELECTED:'已选题',BRIEF_READY:'Brief 完成',DRAFT_READY:'成稿完成',FACT_CHECK:'事实核验',REVIEW:'待审核',APPROVED:'已审核',SCHEDULED:'已排期',PUBLISHING:'发布中',PUBLISHED:'已发布',ANALYZED:'已复盘'})[x]||x}
function reasonLabel(x){return ({generate_brief:'生成 Brief',generate_draft:'生成成稿',manual_save:'手工保存',manual_ai_import:'手动AI导入',approve:'审核通过',restore:'恢复版本'})[x]||x}
function knowledgeKindLabel(x){return ({case:'案例',framework:'框架',note:'笔记',source:'资料'})[x]||x}
function leadStageLabel(x){return ({new:'新线索',contacted:'已联系',qualified:'有效',consulted:'已咨询',won:'已成交',lost:'未成交'})[x]||x}
function postLabel(p){return p?.contents?.title||p?.contents?.topics?.title||p?.external_url||`小红书笔记 ${String(p?.id||'').slice(0,6)}`}
function taskLabel(x){return ({trend_sweep:'热点扫描',topic_radar:'选题雷达',topic_suggest:'选题生成',calendar:'内容排期',editorial_director:'总编选题',brief:'内容Brief',draft:'正式写稿',editorial_review:'总编审稿',fact_check:'事实核验',xhs_native_text:'原生文转图',card_plan:'卡片拆解',repurpose:'内容复用'})[x]||x}
function channelLabel(x){return ({video_script:'短视频口播',wechat_moments:'朋友圈',wechat_group:'家长群',xiaohongshu_text:'小红书摘要'})[x]||x}
function formatTime(x){if(!x)return'';try{return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(x))}catch{return x}}

function signalLabel(x){return ({policy:'政策',admissions:'招生',career:'就业',campus:'高校',question:'家长问题',evergreen:'常青'})[x]||x}
function todayIso(){const d=new Date();const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function addDaysIso(iso,n){const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()+n);const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function formatDateShort(x){if(!x)return'';try{return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric'}).format(new Date(`${String(x).slice(0,10)}T12:00:00`))}catch{return x}}
function weekdayLabel(x){if(!x)return'';try{return new Intl.DateTimeFormat('zh-CN',{weekday:'short'}).format(new Date(`${String(x).slice(0,10)}T12:00:00`))}catch{return''}}

createRoot(document.getElementById('root')).render(<AppErrorBoundary><App/></AppErrorBoundary>)
