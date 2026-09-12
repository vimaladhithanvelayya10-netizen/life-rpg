
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, Award, Bell, BookOpen, CalendarDays, Check, ChevronRight,
  CircleDollarSign, Clock3, Coins, Dumbbell, Flame, Gift, Heart, Home, Gem,
  ListChecks, Lock, Menu, Moon, MoreHorizontal, Pause, Play, Plus, RotateCcw, History,
  Search, Settings, Shield, ShoppingBag, Sparkles, Star, StopCircle, Target,
  Trophy, UserRound, Users, WandSparkles, X, Zap, HeartPulse, Swords,
  NotebookPen, BarChart3, SlidersHorizontal, CalendarCheck, Layers3, Trash2,
  Copy, Archive, RotateCw, SkipForward, MapPin, Tag, CheckCircle2, TimerReset,
  LogOut
} from "lucide-react";
import "./styles.css";
import { apiGet, apiPut, apiPatch, apiPost, getToken, clearToken, isAuthenticated } from "./api.js";

const LS = "lifeRpgCompleteUI";

const initialData = {
  profile: { name: "", title: "Adventurer", level: 1, xp: 0, coins: 0, streak: 0, longestStreak: 0, gender: "male" },
  stats: {
    Intelligence: 10, Strength: 10, Vitality: 10, Discipline: 10, Agility: 10, Charisma: 10, Wealth: 10
  },
  quests: [],
  goals: [],
  habits: [],
  inventory: [],
  rewards: [],
  achievements: [],
  skills: [],
  activity: [],
  notifications: [],
  journal: [],
  challenges: [],
  friends: [],
  settings: { theme: "dark", sounds: true, animations: true, timeFormat: "12h", weekStart: "Monday", profileVisible: true, leaderboardVisible: true }
};

function freshInitialData(){
  return JSON.parse(JSON.stringify(initialData));
}

function loadData(){
  try{
    const raw=localStorage.getItem(LS);
    if(!raw)return freshInitialData();
    const saved=JSON.parse(raw);
    const base=freshInitialData();

    // Migrate older localStorage saves safely. The UI has grown over time,
    // so a save from an older build may not contain newer sections such as
    // inventory, rewards, notifications, etc. Merge them with the defaults
    // instead of crashing the entire React tree.
    const merged={...base,...saved};
    merged.settings={...base.settings,...(saved?.settings||{})};
    for(const key of [
      "stats","settings","profile"
    ]){
      if(saved?.[key] && typeof saved[key]==="object") merged[key]={...base[key],...saved[key]};
    }
    for(const key of [
      "quests","goals","habits","inventory","rewards",
      "achievements","skills","activity","notifications",
      "journal","challenges","friends"
    ]){
      if(!Array.isArray(saved?.[key])) merged[key]=base[key];
    }

    // Older inventory records may lack fields introduced in the full UI.
    merged.quests=merged.quests.map(q=>{
      const migrated={
        ...q,
        startedAt:q.startedAt?Number(q.startedAt):null,
        elapsed:Number(q.elapsed)||0,
        rewardGranted:Boolean(q.rewardGranted),
        completionRatio:Number(q.completionRatio)||0,
        archived:Boolean(q.archived),
        awardedXp:q.awardedXp!=null?Number(q.awardedXp):undefined,
        awardedCoins:q.awardedCoins!=null?Number(q.awardedCoins):undefined,
        awardedStatReward:q.awardedStatReward!=null?Number(q.awardedStatReward):undefined,
      };
      if(migrated.status==="In Progress" && !migrated.startedAt && migrated.elapsed===0 && !migrated.rewardGranted){
        migrated.status="Available";
      }
      return migrated;
    });

    merged.inventory=merged.inventory.map((item,index)=>({
      id:item.id || `i-migrated-${index}-${Date.now()}`,
      name:item.name || "Mystery Item",
      qty:Number.isFinite(Number(item.qty)) ? Math.max(0,Number(item.qty)) : 0,
      type:item.type || "Collectible",
      rarity:item.rarity || "Common",
      desc:item.desc || "An RPG inventory item.",
      effect:item.effect || item.desc || "Use this item to gain its effect.",
      duration:item.duration || "Instant",
      source:item.source || "System",
      expires:item.expires || "Never",
      stackable:item.stackable !== false,
      equipped:Boolean(item.equipped)
    }));
    return merged;
  }catch{
    return freshInitialData();
  }
}
function saveData(d){
  try{localStorage.setItem(LS,JSON.stringify(d));}catch{}
}
function uid(){return crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;}
function xpForQuest(q){
  const difficulty={Easy:1,Normal:1.15,Hard:1.35,Epic:1.6,Legendary:2}[q.difficulty]||1;
  return Math.max(1,Math.round(q.duration*difficulty*({Study:1.25,Learning:1.25,Health:1.2,Career:1.3,Work:1.3,Finance:1.35,Coding:1.3,Reading:1.15,Personal:1}[q.category]||1)));
}
function periodGreeting(h){
  if(h<5)return"Good Night";
  if(h<12)return"Good Morning";
  if(h<17)return"Good Afternoon";
  if(h<21)return"Good Evening";
  return"Good Night";
}
function formatDate(d){return d.toLocaleDateString([], {weekday:"long",day:"numeric",month:"long",year:"numeric"})}
function localDateKey(value=new Date()){
  const d=value instanceof Date?value:new Date(value);
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function formatDateKey(key){
  if(!key)return "";
  const [y,m,d]=key.split("-").map(Number);
  if(!y||!m||!d)return key;
  return new Date(y,m-1,d).toLocaleDateString([], {day:"numeric",month:"long",year:"numeric"});
}
function formatClock(sec){
  const s=Math.max(0,Math.floor(sec));
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),r=s%60;
  return h?`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
}

function questTotalSeconds(q){
  return Math.max(1,(Number(q.duration)||1)*60 + Number(q.extendedSeconds||0));
}
function liveQuestElapsed(q, nowMs){
  const total=questTotalSeconds(q);
  const base=Math.max(0,Number(q._displayElapsed??q.serverActiveSeconds??q.elapsed)||0);
  if(q.status!=="In Progress") return Math.min(base,total);
  if(!q._displayAnchorAt) return Math.min(base,total);
  return Math.min(total, base + Math.max(0,(nowMs-Number(q._displayAnchorAt))/1000));
}
function questRemainingSeconds(q, nowMs){
  if(q.status==="In Progress" && q.deadlineAt){
    return Math.max(0,(new Date(q.deadlineAt).getTime()-nowMs)/1000);
  }
  if(q.status==="Paused" && Number.isFinite(Number(q.pausedRemainingSeconds))) return Math.max(0,Number(q.pausedRemainingSeconds));
  return Math.max(0,questTotalSeconds(q)-liveQuestElapsed(q,nowMs));
}
function questProgress(q, nowMs){
  const total=questTotalSeconds(q);
  return Math.min(100,(liveQuestElapsed(q,nowMs)/total)*100);
}

function normalizeClientQuest(q){
  const now=Date.now();
  const serverElapsed=Math.max(0,Number(q.serverActiveSeconds??q.elapsed??0));
  return {...q,
    startedAt:q.startedAt?Number(q.startedAt):null,
    elapsed:serverElapsed,
    serverActiveSeconds:serverElapsed,
    extendedSeconds:Number(q.extendedSeconds||0),
    pausedRemainingSeconds:Number(q.pausedRemainingSeconds||0),
    lastHeartbeatAt:q.lastHeartbeatAt||null,
    rewardGranted:Boolean(q.rewardGranted),
    completionRatio:Number(q.completionRatio)||0,
    archived:Boolean(q.archived),
    _displayElapsed:serverElapsed,
    _displayAnchorAt:q.status==='In Progress'?now:null
  };
}
function syncClientQuest(q, patch={}){
  const serverElapsed=Math.max(0,Number(patch.serverActiveSeconds??patch.elapsed??q.serverActiveSeconds??q.elapsed??0));
  const next={...q,...patch,elapsed:serverElapsed,serverActiveSeconds:serverElapsed};
  if(next.status==='In Progress'){
    next._displayElapsed=serverElapsed;
    next._displayAnchorAt=Date.now();
  }else{
    next._displayElapsed=serverElapsed;
    next._displayAnchorAt=null;
  }
  return next;
}
function App(){
  const [data,setData]=useState(loadData);
  const [backendReady,setBackendReady]=useState(false);
  const [page,setPage]=useState("Home");
  const [query,setQuery]=useState("");
  const [modal,setModal]=useState(null);
  const [now,setNow]=useState(()=>new Date());
  const [toast,setToast]=useState(null);
  const [mobileNav,setMobileNav]=useState(false);
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [focus,setFocus]=useState({mode:"Pomodoro",seconds:1500,running:false});
  const [selectedDay,setSelectedDay]=useState(new Date().getDate());
  const [historyDate,setHistoryDate]=useState(null);
  const [statsDetails,setStatsDetails]=useState(false);
  const [welcomePop,setWelcomePop]=useState(null);
  const [questActionBusy,setQuestActionBusy]=useState({});

  useEffect(()=>{
    if(!isAuthenticated()){
      window.location.href = "/page1.html";
      return;
    }
    let active=true;
    (async()=>{
      try{
        const response=await apiGet("/bootstrap");
        if(!active || !response?.data)return;
        const remote={...response.data,quests:(Array.isArray(response.data.quests)?response.data.quests:[]).map(q=>{
          const migrated=normalizeClientQuest(q);
          if(migrated.status==="In Progress" && migrated.serverActiveSeconds===0 && !migrated.rewardGranted && !migrated.deadlineAt)migrated.status="Available";
          return migrated;
        })};
        setData(remote);
        setBackendReady(true);
      }catch(err){
        if(active) {
          setBackendReady(false);
          if (err.message && (err.message.includes("Authentication") || err.message.includes("401"))) {
            clearToken();
            window.location.href = "/page1.html";
          }
        }
      }
    })();
    return()=>{active=false};
  },[]);
  useEffect(()=>{
    if(backendReady && data.profile.name){
      saveData(data);
    }
  },[data,backendReady]);
  useEffect(()=>{const i=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(i)},[]);
  useEffect(()=>{
    if(page!=="Home") return;
    const key="lifeRpgWelcomeSeen";
    const first=!localStorage.getItem(key);
    const hour=new Date().getHours();
    const greet=periodGreeting(hour);
    const name=data.profile.name||"Adventurer";
    const active=data.quests.find(q=>q.status==="In Progress");
    const available=data.quests.find(q=>q.status==="Available"||q.status==="Pending");
    const latest=data.activity?.[0];
    const motivations=["Your progress is building. Keep the momentum going.","Small wins become big levels. Ready for the next one?","You are closer than you think. One good quest can move the day forward.","Keep going — today's effort becomes tomorrow's advantage."];
    let message;
    if(first) message=`${greet}, ${name}. What is today's quest?`;
    else if(active) message=`Welcome back, ${name}. Your ${active.title} quest is ready to continue.`;
    else if(latest?.text) message=`Welcome back, ${name}. ${latest.text}. ${motivations[Math.floor(Math.random()*motivations.length)]}`;
    else message=`Welcome back, ${name}. ${greet.toLowerCase()} is a good time to make progress. ${motivations[Math.floor(Math.random()*motivations.length)]}`;
    localStorage.setItem(key,"1");
    setWelcomePop({message,src:data.profile.gender==="male"?"/assets/coach-male.png":"/assets/coach-female.png"});
    const hide=()=>setWelcomePop(null);
    window.addEventListener("click",hide,{once:true});
    return()=>window.removeEventListener("click",hide);
  },[page]);
  useEffect(()=>{
    const running=data.quests.find(q=>q.status==="In Progress");
    if(!running)return;
    const heartbeat=()=>{
      if(document.visibilityState!=="visible")return;
      apiPost(`/quests/${running.id}/heartbeat`,{}).then(out=>{
        if(out?.status==="Expired"||out?.status==="Completed") refreshFromBackend();
        else if(out?.status==="In Progress" && Number.isFinite(Number(out?.elapsed))){
          setData(d=>({...d,quests:d.quests.map(q=>q.id===running.id?syncClientQuest(q,{status:"In Progress",serverActiveSeconds:Number(out.elapsed),elapsed:Number(out.elapsed),deadlineAt:out?.deadlineAt||q.deadlineAt,lastHeartbeatAt:new Date().toISOString()}):q)}));
        }
      }).catch(()=>{});
    };
    heartbeat();
    const interval=setInterval(heartbeat,5000);
    const onVisibility=()=>{if(document.visibilityState==="visible"){refreshFromBackend();heartbeat();}};
    const onPageHide=()=>heartbeat();
    document.addEventListener("visibilitychange",onVisibility);
    window.addEventListener("pagehide",onPageHide);
    return()=>{clearInterval(interval);document.removeEventListener("visibilitychange",onVisibility);window.removeEventListener("pagehide",onPageHide);};
  },[data.quests.map(q=>`${q.id}:${q.status}:${q.duration}`).join("|")]);

  useEffect(()=>{
    const running=data.quests.find(q=>q.status==="In Progress"&&q.deadlineAt);
    if(!running)return;
    if(new Date(running.deadlineAt).getTime()<=Date.now()) refreshFromBackend();
  },[now]);
  useEffect(()=>{
    if(!toast)return;
    const i=setTimeout(()=>setToast(null),2200);
    return()=>clearTimeout(i);
  },[toast]);

  useEffect(()=>{
    if(!focus.running)return;
    const i=setInterval(()=>setFocus(v=>{
      if(v.seconds<=1){
        setData(d=>applyReward(d,50,20,"Focus Session",{stat:"Discipline",statReward:1}));
        setToast({title:"Focus session complete",message:"+50 XP • +20 coins • +1 Discipline"});
        return {...v,seconds: v.mode==="Pomodoro"?1500:3600,running:false};
      }
      return {...v,seconds:v.seconds-1};
    }),1000);
    return()=>clearInterval(i);
  },[focus.running]);

  const doToast=(title,message)=>setToast({title,message});

  async function refreshFromBackend(){
    try{
      const r=await apiGet("/bootstrap");
      if(r?.data){
        const remoteData={...r.data,quests:(Array.isArray(r.data.quests)?r.data.quests:[]).map(normalizeClientQuest)};
        setData(remoteData);
        setBackendReady(true);
        return remoteData;
      }
      return null;
    }catch(e){
      setBackendReady(false);
      doToast("Backend unavailable",e.message||"Unable to sync LIFE RPG data.");
      return null;
    }
  }

  function mutate(fn){setData(d=>fn({
    ...d,
    profile:{...d.profile},
    stats:{...d.stats},
    settings:{...d.settings},
    coach:d.coach?{...d.coach}:d.coach,
    quests:[...d.quests].map(q=>({...q})),
    goals:[...d.goals].map(g=>({...g})),
    habits:[...d.habits].map(h=>({...h})),
    inventory:[...d.inventory].map(i=>({...i})),
    rewards:[...d.rewards].map(r=>({...r})),
    activity:[...d.activity],
    achievements:[...d.achievements].map(a=>({...a})),
    skills:[...d.skills].map(sk=>({...sk})),
    notifications:[...d.notifications].map(n=>({...n}))
  }));}

  function addActivity(d,kind,text,value="",extra={}){
    const occurredAt=extra.occurredAt||new Date().toISOString();
    const entry={id:uid(),kind,text,value,time:"just now",occurredAt,dateKey:localDateKey(occurredAt),...extra};
    if(!entry.dateKey) entry.dateKey=localDateKey(occurredAt);
    d.activity.unshift(entry);
    d.activity=d.activity.slice(0,60);
    return d;
  }

  function applyReward(d,xp,coins,event,extra={}){
    d.profile.xp += xp;
    d.profile.coins += coins;
    if(extra.stat && extra.statReward){
      d.stats[extra.stat]=Math.min(999,(d.stats[extra.stat]||0)+extra.statReward);
      addActivity(d,"Stats",`+${extra.statReward} ${extra.stat}`,`+${extra.statReward}`);
    }
    const occurredAt=extra.occurredAt||new Date().toISOString();
    const xpAct={id:uid(),kind:"XP",text:event,value:`+${xp} XP`,time:"just now",occurredAt,dateKey:localDateKey(occurredAt)};
    if(extra.questId) xpAct.questId=extra.questId;
    d.activity.unshift(xpAct);
    if(coins){const coinAct={id:uid(),kind:"Coins",text:event,value:`+${coins} coins`,time:"just now",occurredAt,dateKey:localDateKey(occurredAt)};if(extra.questId) coinAct.questId=extra.questId;d.activity.unshift(coinAct);}
    d.activity=d.activity.slice(0,60);
    return d;
  }

  async function startQuest(q){
    if(!q || ["Completed","Archived","Skipped","Expired"].includes(q.status)) return;
    const another=data.quests.find(x=>x.id!==q.id && x.status==="In Progress");
    if(another){ doToast("Quest already running",`Finish or pause “${another.title}” before starting another quest.`); return; }
    if(questActionBusy[q.id]) return;
    setQuestActionBusy(v=>({...v,[q.id]:true}));
    try{
      const out=await apiPost(`/quests/${q.id}/start`,{});
      setData(d=>({...d,quests:d.quests.map(x=>x.id===q.id?syncClientQuest(x,{status:out?.status||"In Progress",startedAt:Date.now(),deadlineAt:out?.deadlineAt||x.deadlineAt,elapsed:Number(out?.elapsed??x.elapsed??0),serverActiveSeconds:Number(out?.elapsed??x.serverActiveSeconds??0),completionRatio:0}):x)}));
      await refreshFromBackend();
      setToast({title:"Quest started",message:`${q.title} • timer running`});
    }catch(e){ doToast("Could not start quest",e.message); }
    finally{setQuestActionBusy(v=>{const n={...v};delete n[q.id];return n;});}
  }

  async function updateQuestTimer(q, action){
    if(!q || questActionBusy[q.id])return;
    setQuestActionBusy(v=>({...v,[q.id]:true}));
    try{
      const out=await apiPost(`/quests/${q.id}/${action}`,{});
      if(action==="pause"){
        setData(d=>({...d,quests:d.quests.map(x=>x.id===q.id?syncClientQuest(x,{status:"Paused",elapsed:Number(out?.elapsed??x.elapsed??0),serverActiveSeconds:Number(out?.elapsed??x.serverActiveSeconds??0),startedAt:null,deadlineAt:null,pausedRemainingSeconds:Number(out?.remainingSeconds??out?.pausedRemainingSeconds??x.pausedRemainingSeconds??0)}):x)}));
        setToast({title:"Quest paused",message:q.title});
      }
      if(action==="resume"){
        setData(d=>({...d,quests:d.quests.map(x=>x.id===q.id?syncClientQuest(x,{status:"In Progress",startedAt:Date.now(),deadlineAt:out?.deadlineAt||x.deadlineAt,pausedRemainingSeconds:0}):x)}));
        setToast({title:"Quest resumed",message:q.title});
      }
      if(action==="stop"){
        setToast({title:out?.status==="Expired"?"Quest expired":"Quest completed",message:`+${out?.xp||0} XP • +${out?.coins||0} coins • ${Math.round((out?.ratio||0)*100)}% active time`});
      }
      await refreshFromBackend();
    }catch(e){ doToast("Quest action failed",e.message); }
    finally{setQuestActionBusy(v=>{const n={...v};delete n[q.id];return n;});}
  }

  async function extendQuest(q){
    if(!q || questActionBusy[q.id] || !["In Progress","Paused"].includes(q.status)) return;
    const raw=window.prompt("Extend this quest by how many minutes? (5–120)","15");
    if(raw===null)return;
    const minutes=Math.max(5,Math.min(120,Number(raw)||15));
    setQuestActionBusy(v=>({...v,[q.id]:true}));
    try{
      const out=await apiPost(`/quests/${q.id}/extend`,{minutes});
      await refreshFromBackend();
      doToast("Quest extended",`${minutes} minutes added to ${q.title}. ${out?.status||q.status}.`);
    }catch(e){ doToast("Could not extend quest",e.message); }
    finally{setQuestActionBusy(v=>{const n={...v};delete n[q.id];return n;});}
  }


  async function redeemReward(r){
    if(data.profile.coins<r.cost){doToast("Not enough coins",`Need ${r.cost-data.profile.coins} more coins.`);return}
    try{
      const out=await apiPost(`/shop/${r.id}/purchase`,{});
      await refreshFromBackend();
      doToast("Reward Redeemed",`${r.name} purchased! Balance: ${out?.coinsLeft ?? (data.profile.coins - r.cost)} coins`);
    }catch(e){
      doToast("Purchase failed",e.message);
    }
  }

  const handleLogout=async()=>{
    try {
      await apiPost('/auth/logout', {});
    } catch {}
    clearToken();
    localStorage.removeItem(LS);
    window.location.href = "/page1.html";
  };

  const filtered = data.quests.filter(q=>[q.title,q.category,q.description,...(q.tags||[])].join(" ").toLowerCase().includes(query.toLowerCase()));

  return <div className={`shell ${sidebarOpen?"sidebar-open":"sidebar-closed"}`}>
    <Sidebar page={page} setPage={p=>{setPage(p);setMobileNav(false)}} mobile={mobileNav} open={sidebarOpen} onToggle={()=>setSidebarOpen(v=>!v)} />
    <div className="content-wrap">
      <Topbar query={query} setQuery={setQuery} data={data} setMobileNav={setMobileNav} onToggleSidebar={()=>setSidebarOpen(v=>!v)} onLogout={handleLogout} />
      <AnimatePresence mode="wait">
        <motion.main key={page} className="page" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:.18}}>
          {page==="Home" && <HomePage data={data} now={now} setData={setData} filtered={filtered} startQuest={startQuest} updateQuestTimer={updateQuestTimer} extendQuest={extendQuest} setModal={setModal} redeemReward={redeemReward} setPage={setPage} focus={focus} setFocus={setFocus} doToast={doToast} onStatsDetails={()=>setStatsDetails(true)} />}
          {page==="Quests" && <QuestsPage data={data} setData={setData} query={query} setModal={setModal} startQuest={startQuest} updateQuestTimer={updateQuestTimer} extendQuest={extendQuest} doToast={doToast} now={now} />}
          {page==="Stats" && <StatsPage data={data} onStatsDetails={()=>setStatsDetails(true)} />}
          {page==="Skills" && <SkillsPage data={data} setData={setData} doToast={doToast} />}
          {page==="Inventory" && <InventoryPage data={data} setData={setData} doToast={doToast} />}
          {page==="Shop" && <ShopPage data={data} setData={setData} redeemReward={redeemReward} doToast={doToast} />}
          {page==="Social" && <SocialPage data={data} doToast={doToast} setData={setData} backendReady={backendReady} />}
          {page==="Calendar" && <CalendarPage data={data} selectedDay={selectedDay} setSelectedDay={setSelectedDay} setPage={setPage} setHistoryDate={setHistoryDate} doToast={doToast} />}
          {page==="History" && <HistoryPage data={data} setModal={setModal} historyDate={historyDate} setHistoryDate={setHistoryDate} />}
          {page==="Settings" && <SettingsPage data={data} setData={setData} doToast={doToast} handleLogout={handleLogout} />}
        </motion.main>
      </AnimatePresence>
      <div className="mobile-spacer"/>
    </div>
    <AnimatePresence>{welcomePop&&<WelcomePopup data={data} welcome={welcomePop} close={()=>setWelcomePop(null)} />}</AnimatePresence>
    <AnimatePresence>{toast&&<Toast {...toast}/>}</AnimatePresence>
    {statsDetails && <StatsDetailsModal data={data} close={()=>setStatsDetails(false)} />}
    {modal && <Modal type={modal.type} activity={modal.activity} data={data} close={()=>setModal(null)} setData={setData} doToast={doToast} />}
  </div>
}

function Sidebar({page,setPage,mobile,open,onToggle}){
  const items=[
    ["Home",Home],["Quests",ListChecks],["Stats",BarChart3],["Skills",Swords],["Inventory",ShoppingBag],["Shop",Gift],["History",History],
    ["Social",Users],["Calendar",CalendarDays],["Settings",Settings]
  ];
  return <>
    {!open && <button className="sidebar-peek" onClick={onToggle} aria-label="Open navigation"><img src="/assets/logo.png"/></button>}
    <aside className={`sidebar ${open||mobile?"open":""}`}>
      <button className="brand brand-toggle" onClick={onToggle} aria-label={open?"Close navigation":"Open navigation"}><img src="/assets/logo.png"/><div><b>LIFE RPG</b><small>LEVEL UP EVERY DAY</small></div></button>
      <nav>{items.map(([n,I])=><button key={n} onClick={()=>setPage(n)} className={page===n?"nav active":"nav"}><I size={18}/><span>{n}</span></button>)}</nav>
      <div className="sidebar-bottom">“A better you<br/>is a stronger world.”</div>
    </aside>
  </>
}
function Topbar({query,setQuery,data,setMobileNav,onToggleSidebar,onLogout}){
  const displayName = data.profile.name || "Adventurer";
  const tf = data.settings?.timeFormat || "12h";
  const timeStr = tf === "24h"
    ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
    : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  return <header className="topbar">
    <button className="hamb" onClick={onToggleSidebar}><Menu size={18}/></button>
    <div className="global-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search quests, skills, achievements, rewards..."/></div>
    <div className="top-actions">
      <span className="top-date">{formatDate(new Date())}</span>
      <strong>{timeStr}</strong>
      <button className="bell"><Bell size={18}/><em>{data.notifications.filter(n=>n.unread).length}</em></button>
      <div className="avatar-text">{displayName[0]||"?"}</div>
      <div><b>{displayName}</b><small>Level {data.profile.level}</small></div>
      {onLogout && <button className="header-logout-btn" onClick={onLogout} title="Sign Out"><LogOut size={13}/><span>Logout</span></button>}
    </div>
  </header>
}

function HomePage({data,now,setData,filtered,startQuest,updateQuestTimer,extendQuest,setModal,redeemReward,setPage,focus,setFocus,doToast,onStatsDetails}){
  const greet=periodGreeting(now.getHours());
  const next=data.profile.level*1000;
  return <div>
    <Hero data={data} greet={greet} now={now}/>
    <PlayerStrip data={data} next={next}/>
    <div className="grid top"><QuestPanel data={data} quests={filtered} startQuest={startQuest} updateQuestTimer={updateQuestTimer} extendQuest={extendQuest} setModal={setModal} now={now} /><StatsPanel data={data} onStatsDetails={onStatsDetails}/></div>
    <div className="grid four"><GoalsMini data={data}/><HabitsMini data={data} setData={setData} doToast={doToast}/><AchievementsMini data={data}/><SkillMini data={data} setPage={setPage}/></div>
    <div className="grid two"><InventoryMini data={data} setPage={setPage}/><ShopMini data={data} redeemReward={redeemReward}/></div>
    <div className="grid four"><ProgressMini data={data}/><CalendarMini data={data}/><FocusMini focus={focus} setFocus={setFocus}/><LeaderboardMini data={data}/></div>
    <div className="grid recent"><RecentActivity data={data}/><QuoteCard/></div>
  </div>
}

function Hero({data,greet,now}){
  const tf = data.settings?.timeFormat || "12h";
  const timeStr = tf === "24h"
    ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
    : now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  const name = data.profile.name || "Adventurer";
  return <section className="hero"><div className="hero-bg"/><div className="hero-dark"/><div className="hero-copy"><span>{greet}.</span><h1>{greet}<br/><input value={name} onChange={()=>{}} size={Math.max(12, name.length + 1)} readOnly/></h1><p>Keep your momentum. There is still time to level up.</p><div className="quote-chip">“Discipline today, a legendary tomorrow.”</div></div><div className="phase-box"><div className="phase-sky"><div className="sun"/><div className="cloud c1"/><div className="cloud c2"/></div><div className="phase-info"><div><small>CURRENT PHASE</small><b>{greet}</b></div><span>{timeStr}</span></div></div></section>
}
function PlayerStrip({data,next}){const pct=Math.min(100,(data.profile.xp/(next))*100);return <section className="panel player-strip"><div className="player-block"><div className="level-badge">P</div><div><b>Level {data.profile.level}</b><span>{data.profile.title}</span></div></div><div className="xpblock"><div><span>{data.profile.xp.toLocaleString()} XP</span><small>{Math.max(0,next-data.profile.xp)} XP to Level {data.profile.level+1}</small></div><div className="bar"><i style={{width:`${pct}%`}}/></div></div><div className="coin-balance"><CircleDollarSign/><b>{data.profile.coins.toLocaleString()}</b><span>coins</span></div></section>}

function QuestPanel({data,quests,setModal,startQuest,updateQuestTimer,extendQuest,now}){
  const ordered=[...quests].sort((a,b)=>(a.status==="In Progress"?0:1)-(b.status==="In Progress"?0:1));
  return <section className="panel big-panel"><SectionHead eyebrow="TODAY'S QUESTS" title="Quest List" text="Start one quest at a time and control the timer while you work." action={<button className="link" onClick={()=>setModal({type:"quest",quest:null})}>+ Add Quest</button>}/><div className="mini-quests">{ordered.slice(0,4).map(q=><QuestRow q={q} key={q.id} startQuest={startQuest} updateQuestTimer={updateQuestTimer} extendQuest={extendQuest} now={now}/>)}</div></section>
}

function QuestRow({q,startQuest,updateQuestTimer,extendQuest,now}){
  const elapsed=liveQuestElapsed(q,now.getTime());
  const pct=Math.round(questProgress(q,now.getTime()));
  const color=pct<40?"red":pct<80?"yellow":"green";
  const remaining=questRemainingSeconds(q,now.getTime());
  const actions=(q.status==="Available"||q.status==="Pending")?<button className="mini-gold" onClick={()=>startQuest(q)}><Play size={12}/>Start</button>:
    (q.status==="In Progress"||q.status==="Paused")?<div className="timer-control-wrap"><div className="timer-actions"><button className="mini-ghost" disabled={q.status!=="In Progress"} onClick={()=>updateQuestTimer(q,"pause")}><Pause size={11}/>Pause</button><button className="mini-ghost" disabled={q.status!=="Paused"} onClick={()=>updateQuestTimer(q,"resume")}><Play size={11}/>Resume</button><button className="mini-gold stop" onClick={()=>updateQuestTimer(q,"stop")}><StopCircle size={11}/>Stop</button></div><button className="mini-ghost extend-btn" onClick={()=>extendQuest(q)}><TimerReset size={11}/>Extend</button></div>:
    <span className="quest-complete-label">{q.status==="Completed"?`Completed ${Math.round((q.completionRatio||1)*100)}%`:q.status}</span>;
  return <div className="quest-row">
    <div className="q-icon"><Target size={16}/></div>
    <div className="q-body"><div className="q-top"><b>{q.title}</b><span className="pill">{q.category}</span><span className="pill soft">{q.duration} min</span><strong>⚡ +{q.xp} XP</strong></div><div className="q-mid"><span>{q.status}</span><b>{formatClock(remaining)}</b></div><div className="progress"><i className={color} style={{width:`${pct}%`}}/></div><div className="q-foot"><span>{pct}%</span><small>{Math.floor(elapsed/60)} / {Math.ceil(questTotalSeconds(q)/60)} min</small></div></div>
    <div className="q-actions">{actions}</div>
  </div>
}

function StatsPanel({data,onStatsDetails}){const stats=Object.entries(data.stats);return <section className="panel"><SectionHead title="RPG Stats" action={<button className="stats-details-link" onClick={onStatsDetails}>View Details →</button>}/><div className="stats-panel">{stats.map(([k,v])=><div className="statline" key={k}><span className="statdot">{k[0]}</span><b>{k}</b><div className="tinybar"><i style={{width:`${v}%`}}/></div><span>{v}</span></div>)}</div><div className="stats-note">Complete real-life activities to grow your stats.</div></section>}

function GoalsMini({data}){return <MiniCard title="Goals">{data.goals.map(g=><div className="goal-line" key={g.id}><Target size={15}/><span>{g.name}</span><b>{g.progress}%</b><div className="slim"><i style={{width:`${g.progress}%`}}/></div></div>)}</MiniCard>}
function HabitsMini({data,setData,doToast}){return <MiniCard title="Habit Streaks">{data.habits.slice(0,4).map(h=><div className="habit-line" key={h.id}><span>{h.name}</span><b><Flame size={12}/> {h.streak} days</b><button disabled={h.doneToday||h.paused} onClick={()=>{setData(d=>({...d,habits:d.habits.map(x=>x.id===h.id?{...x,doneToday:true,streak:x.streak+1}:x)}));doToast("Habit complete",`🔥 ${h.name} streak increased`)}}>✓</button></div>)}</MiniCard>}
function AchievementsMini({data}){return <MiniCard title="Achievements">{data.achievements.slice(0,4).map(a=><div className={`ach-line ${a.unlocked?"":"locked"}`} key={a.id}><div className="ach-badge"><Award size={15}/></div><div><b>{a.name}</b><small>{a.desc}</small></div></div>)}</MiniCard>}
function SkillMini({data,setPage}){return <MiniCard title="Skill Tree" action={<button className="link" onClick={()=>setPage("Skills")}>Open Tree →</button>}><div className="mini-tree"><div className="node top">KN</div><div className="node left">PR</div><div className="node right">RD</div><div className="node bl">CO</div><div className="node br">FX</div></div><small className="muted">Learn skills. Unlock your potential.</small></MiniCard>}
function InventoryMini({data,setPage}){return <MiniCard title="Inventory" action={<button className="link" onClick={()=>setPage("Inventory")}>View All →</button>}>{data.inventory.slice(0,3).map(i=><div className="inventory-line" key={i.id}><Zap size={15}/><span>{i.name}<small>{i.qty} left</small></span><b>{i.qty}</b></div>)}</MiniCard>}
function ShopMini({data,redeemReward}){return <MiniCard title="Reward Shop">{data.rewards.slice(0,3).map(r=><div className="shop-line" key={r.id}><span>{r.name}<small>{r.cost} coins</small></span><button onClick={()=>redeemReward(r)}>Redeem</button></div>)}</MiniCard>}
function ProgressMini({data}){return <MiniCard title="Your Progress"><div className="bars7">{[45,66,52,82,70,91,76].map((h,i)=><div key={i}><i style={{height:`${h}%`}}/><small>{["M","T","W","T","F","S","S"][i]}</small></div>)}</div></MiniCard>}
function CalendarMini({data}){return <MiniCard title="Productivity Calendar"><div className="heatmap">{Array.from({length:35},(_,i)=><span key={i} className={`heat h${(i*3)%4}`}>{i<30?i+1:""}</span>)}</div></MiniCard>}
function FocusMini({focus,setFocus}){return <MiniCard title="Focus Mode"><div className="focus-mini"><div className="tabs"><span className="active">Pomodoro</span><span>Deep Work</span><span>Custom</span></div><strong>{formatClock(focus.seconds)}</strong><button className="gold full" onClick={()=>setFocus(v=>({...v,running:!v}))}>{focus.running?"Pause":"Start Focus"}</button><small>Completion earns XP and Discipline.</small></div></MiniCard>}
function LeaderboardMini({data}){const rows=[...data.friends,{name:"You",xp:data.profile.xp}].sort((a,b)=>b.xp-a.xp).slice(0,5);return <MiniCard title="Leaderboard">{rows.map((x,i)=><div className={`leader-line ${x.name==="You"?"me":""}`} key={x.name}><span>{i+1}</span><b>{x.name}</b><strong>{x.xp} XP</strong></div>)}</MiniCard>}
function RecentActivity({data}){return <section className="panel recent-card"><SectionHead title="Recent Activity"/>{data.activity.slice(0,6).map(a=><div className="activity-line" key={a.id}><span className="activity-icon">{a.kind==="XP"?<Zap size={14}/>:a.kind==="Coins"?<Coins size={14}/>:a.kind==="Achievement"?<Award size={14}/>:<ListChecks size={14}/>}</span><span>{a.text}</span><b>{a.value}</b><small>{a.time}</small></div>)}</section>}
function QuoteCard(){return <div className="quote-card"><img src="/assets/mountain.png"/><div/><blockquote>“Level up not just in games,<br/>but in life.”</blockquote></div>}
function MiniCard({title,children,action}){return <section className="panel mini-card"><SectionHead title={title} action={action}/>{children}</section>}
function SectionHead({eyebrow,title,text,action}){return <div className="section-head">{divSafe(eyebrow)&&<span className="eyebrow">{eyebrow}</span>}<div className="head-row"><div><h2>{title}</h2>{text&&<p>{text}</p>}</div>{action}</div></div>}
function divSafe(v){return !!v}
function WelcomePopup({data,welcome,close}){
  return <motion.div className="welcome-pop" initial={{opacity:0,y:24,scale:.96}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:24,scale:.96}} onClick={e=>e.stopPropagation()}>
    <img src={welcome.src} alt="LIFE RPG avatar"/>
    <div className="welcome-pop-bubble"><button onClick={close} aria-label="Close"><X size={14}/></button><span className="eyebrow">LIFE RPG</span><p>{welcome.message}</p><small>{data.profile.level ? `Level ${data.profile.level} · ${data.profile.xp.toLocaleString()} XP` : "Ready"}</small></div>
  </motion.div>
}
function Toast({title,message}){return <motion.div className="toast" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:20}}><Sparkles size={18}/><div><b>{title}</b><span>{message}</span></div></motion.div>}

function QuestsPage({data,setData,query,setModal,startQuest,updateQuestTimer,extendQuest,doToast,now}){
  const [view,setView]=useState("All");
  const quests=data.quests.filter(q=>(view==="All"||q.status===view)&&q.title.toLowerCase().includes(query.toLowerCase()));
  return <PageContainer title="Quests" subtitle="Create, schedule, track and manage every real-life activity.">
    <div className="page-toolbar"><button className="gold" onClick={()=>setModal({type:"quest",quest:null})}><Plus size={15}/> Add Quest</button>{["All","Available","In Progress","Paused","Completed","Skipped","Archived"].map(v=><button className={view===v?"filter active":"filter"} key={v} onClick={()=>setView(v)}>{v}</button>)}</div>
    <div className="quest-grid-large">{quests.map(q=><QuestFullCard key={q.id} q={q} startQuest={startQuest} updateQuestTimer={updateQuestTimer} extendQuest={extendQuest} now={now}/>)}</div>
  </PageContainer>
}
function QuestFullCard({q,startQuest,updateQuestTimer,extendQuest,now}){
  const elapsed=liveQuestElapsed(q,now.getTime());
  const pct=Math.round(questProgress(q,now.getTime()));
  const color=pct<40?"red":pct<80?"yellow":"green";
  const remaining=questRemainingSeconds(q,now.getTime());
  const controls=(q.status==="Available"||q.status==="Pending")?<button className="gold quest-main-action" onClick={()=>startQuest(q)}><Play size={15}/>Start</button>:
    (q.status==="In Progress"||q.status==="Paused")?<div className="quest-timer-wrap"><div className="quest-timer-actions"><button disabled={q.status!=="In Progress"} onClick={()=>updateQuestTimer(q,"pause")}><Pause size={15}/>Pause</button><button disabled={q.status!=="Paused"} onClick={()=>updateQuestTimer(q,"resume")}><Play size={15}/>Resume</button><button className="stop-control" onClick={()=>updateQuestTimer(q,"stop")}><StopCircle size={15}/>Stop</button></div><button className="extend-control" onClick={()=>extendQuest(q)}><TimerReset size={15}/>Extend Time</button></div>:
    <span className="quest-finished">{q.status==="Completed"?`Completed • ${Math.round((q.completionRatio||1)*100)}% rewarded`:q.status}</span>;
  return <section className="panel full-quest"><div className="full-quest-head"><div><span className="eyebrow">{q.category} • {q.difficulty}</span><h3>{q.title}</h3><p>{q.description}</p></div><span className="status-chip">{q.status}</span></div>
    <div className="meta-grid"><span><Clock3/> {q.duration} min</span><span><Zap/> +{q.xp} XP</span><span><Coins/> +{q.coins} coins</span><span><Target/> +{q.statReward} {q.stat}</span><span><CalendarCheck/> {q.deadline}</span><span><Tag/> {(q.tags||[]).join(", ")||"No tags"}</span></div>
    <div className="progress big"><i className={color} style={{width:`${pct}%`}}/></div>
    <div className="q-duration-row"><span>{pct}% complete</span><b>{formatClock(remaining)} remaining</b></div>
    <div className="full-quest-actions single-action">{controls}</div>
  </section>
}

function StatsPage({data,onStatsDetails}){
  const stats=Object.entries(data.stats);
  return <PageContainer title="Statistics & Analytics" subtitle="Measure XP, coins, consistency, focus, goals and stat growth."><div className="stats-page-actions"><button className="gold" onClick={onStatsDetails}>View RPG Stats Details</button></div>
    <div className="stat-cards">{[
      ["XP Earned",data.profile.xp,"+18%"],["Coins",data.profile.coins,"+9%"],["Quests Completed",data.quests.filter(q=>q.status==="Completed").length,"+12%"],["Focus Time","8h 42m","+21%"],["Longest Streak","18 days","+4 days"],["Goals Completed","7","3 this month"]
    ].map(([a,b,c])=><div className="panel stat-card" key={a}><span>{a}</span><strong>{b}</strong><small>{c}</small></div>)}</div>
    <div className="analytics-grid"><ChartPanel title="XP over time" values={[120,180,150,260,215,310,285]}/><ChartPanel title="Coins over time" values={[70,110,90,150,135,220,180]}/><ChartPanel title="Completion rate" values={[45,58,52,72,68,84,78]}/><ChartPanel title="Stat growth" values={[20,26,31,35,44,52,61]}/></div>
    <section className="panel table-card"><SectionHead title="Category Performance"/><div className="table-head"><span>Category</span><span>Completed</span><span>XP</span><span>Consistency</span></div>{["Study","Health","Career","Reading","Finance","Personal"].map((x,i)=><div className="table-row" key={x}><span>{x}</span><span>{[22,15,9,8,6,13][i]}</span><span>{[1350,980,720,510,460,300][i]}</span><span>{[86,74,68,72,61,79][i]}%</span></div>)}</section>
  </PageContainer>
}

function StatsDetailsModal({data,close}){
  const entries=Object.entries(data.stats);
  const max=100;
  const recent=data.activity.filter(a=>a.kind==="Stats").slice(0,6);
  return <div className="stats-details-backdrop" onClick={close}>
    <motion.div className="stats-details-modal" initial={{opacity:0,y:18,scale:.98}} animate={{opacity:1,y:0,scale:1}} onClick={e=>e.stopPropagation()}>
      <div className="stats-details-head"><div><span className="eyebrow">RPG CHARACTER</span><h2>Stat Details</h2><p>Understand where your character is strongest and what recent quests have changed.</p></div><button className="close-button" onClick={close}><X size={20}/></button></div>
      <div className="stats-detail-grid">{entries.map(([name,value])=>{const milestone=Math.min(100,Math.ceil(value/10)*10+10); const recentGain=recent.filter(r=>String(r.text).toLowerCase().includes(name.toLowerCase())).reduce((n,r)=>n+(parseInt(r.value)||0),0); return <div className="stats-detail-card" key={name}><div className="stats-detail-top"><div className="stats-detail-icon">{name[0]}</div><div><b>{name}</b><span>Current stat</span></div><strong>{value}</strong></div><div className="detail-bar"><i style={{width:`${Math.min(max,value)}%`}}/></div><div className="stats-detail-meta"><span>Next milestone</span><b>{milestone}</b></div><div className="stats-detail-meta"><span>Recent change</span><b>{recentGain>0?`+${recentGain}`:"Stable"}</b></div></div>})}</div>
      <div className="stats-detail-footer"><div><b>Strongest stat</b><span>{entries.sort((a,b)=>b[1]-a[1])[0]?.[0]}</span></div><div><b>Average</b><span>{Math.round(entries.reduce((n,[,v])=>n+v,0)/entries.length)}</span></div><div><b>Growth source</b><span>Completed real-life activities</span></div></div>
    </motion.div>
  </div>
}

function ChartPanel({title,values}){return <section className="panel chart-panel"><SectionHead title={title}/><div className="chart-area">{values.map((v,i)=><div key={i} className="chart-col"><i style={{height:`${v/3}px`}}/><small>{["M","T","W","T","F","S","S"][i]}</small></div>)}</div></section>}

function SkillsPage({data,setData,doToast}){
  return <PageContainer title="Skill Tree" subtitle="Unlock progression paths, prerequisites, bonuses and special rewards.">
    <div className="skills-layout"><section className="panel skill-map-large">{data.skills.map((s,i)=><motion.button whileHover={{scale:1.05}} className={`skill-node-large ${s.unlocked?"unlocked":"locked"}`} key={s.id} onClick={()=>{if(s.unlocked)doToast(s.name,`Level ${s.level}`); else {const parentsDone=s.parents.every(pid=>data.skills.find(x=>x.id===pid)?.unlocked); if(parentsDone){setData(d=>({...d,skills:d.skills.map(x=>x.id===s.id?{...x,unlocked:true,level:1}:x)}));doToast("Skill unlocked",s.name)}else doToast("Locked skill","Complete its prerequisites first.")}}}><div>{s.unlocked?<Star size={20}/>:<Lock size={20}/>}</div><strong>{s.name}</strong><span>{s.unlocked?`Level ${s.level}`:"Locked"}</span></motion.button>)}</section><section className="panel skill-details"><SectionHead title="How skills work"/><ul><li>Level up skills through related quests.</li><li>Prerequisites unlock advanced paths.</li><li>Skills can unlock quests, titles and shop items.</li></ul></section></div>
  </PageContainer>
}

function InventoryPage({data,setData,doToast}){
  const [filter,setFilter]=useState("All");
  const [search,setSearch]=useState("");
  const [sort,setSort]=useState("name");
  const [inspectItem,setInspectItem]=useState(null);

  const inventory=Array.isArray(data.inventory)?data.inventory:[];
  let items=inventory.filter(i=>filter==="All"||i.type===filter||i.rarity===filter);
  if(search.trim()){
    const q=search.toLowerCase();
    items=items.filter(i=>[i.name,i.desc,i.type,i.rarity,i.effect].join(" ").toLowerCase().includes(q));
  }
  items.sort((a,b)=>{
    if(sort==="qty") return (b.qty||0)-(a.qty||0);
    if(sort==="rarity") return (b.rarity||"").localeCompare(a.rarity||"");
    return (a.name||"").localeCompare(b.name||"");
  });

  async function useItem(item){
    if(item.qty<=0)return;
    try {
      const res = await apiPost(`/inventory/${item.id}/use`, {});
      setData(d=>({...d,inventory:d.inventory.map(x=>x.id===item.id?{...x,qty:x.qty-1}:x).filter(x=>x.qty>0)}));
      doToast(item.name, res?.message || "Item used successfully.");
    } catch(e) {
      doToast("Could not use item", e.message);
    }
  }

  async function toggleEquip(item){
    try {
      const res = await apiPost(`/inventory/${item.id}/equip`, {});
      setData(d=>({...d,inventory:d.inventory.map(x=>x.id===item.id?{...x,equipped:Boolean(res?.equipped)}:x)}));
      doToast(item.name, res?.equipped ? "Equipped." : "Unequipped.");
    } catch(e) {
      doToast("Equip failed", e.message);
    }
  }

  async function discardItem(item){
    if(!window.confirm(`Discard 1x ${item.name}? This action cannot be undone.`)) return;
    try {
      const res = await apiPost(`/inventory/${item.id}/discard`, { count: 1 });
      setData(d=>({...d,inventory:d.inventory.map(x=>x.id===item.id?{...x,qty:x.qty-1}:x).filter(x=>x.qty>0)}));
      doToast("Item discarded", res?.message || `Discarded 1x ${item.name}.`);
    } catch(e) {
      doToast("Discard failed", e.message);
    }
  }

  return <PageContainer title="Inventory" subtitle="Collect, inspect, use and manage your rewards and items.">
    <div className="inventory-toolbar">
      <div className="inventory-search">
        <Search size={14}/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search inventory items..."/>
      </div>
      <select className="sort-select" value={sort} onChange={e=>setSort(e.target.value)}>
        <option value="name">Sort by Name</option>
        <option value="qty">Sort by Quantity</option>
        <option value="rarity">Sort by Rarity</option>
      </select>
    </div>
    <div className="page-toolbar">{["All","Boost","Shield","Consumable","Collectible","Rare","Epic","Legendary"].map(v=><button className={filter===v?"filter active":"filter"} key={v} onClick={()=>setFilter(v)}>{v}</button>)}</div>
    <div className="inventory-grid">{items.map(i=><section className="panel inventory-card-large" key={i.id}><div className="item-art"><Gem size={30}/></div><div><span className="rarity">{i.rarity}</span><h3>{i.name}</h3><p>{i.desc}</p></div><div className="item-actions"><span>Qty {i.qty}</span><button onClick={()=>setInspectItem(i)}>Inspect</button><button className="gold" disabled={!i.qty} onClick={()=>useItem(i)}>Use</button><button onClick={()=>toggleEquip(i)}>{i.equipped?"Unequip":"Equip"}</button><button className="danger-outline" onClick={()=>discardItem(i)}>Discard</button></div></section>)}</div>

    {inspectItem && <div className="modal-backdrop" onClick={()=>setInspectItem(null)}>
      <motion.div className="item-details-modal" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <div><span className="eyebrow">{inspectItem.rarity?.toUpperCase() || "ITEM"}</span><h2>{inspectItem.name}</h2></div>
          <button onClick={()=>setInspectItem(null)}><X/></button>
        </div>
        <div className="details-art"><Gem size={48}/></div>
        <div className="detail-grid">
          <div><span>TYPE</span><b>{inspectItem.type || "Item"}</b></div>
          <div><span>QUANTITY</span><b>{inspectItem.qty}</b></div>
          <div><span>EQUIPPED</span><b>{inspectItem.equipped ? "Yes" : "No"}</b></div>
          <div><span>DURATION</span><b>{inspectItem.duration || "Permanent / Instant"}</b></div>
        </div>
        <div style={{marginTop:"10px"}}>
          <div style={{fontSize:"8px",color:"#68777e",letterSpacing:".13em",textTransform:"uppercase",marginBottom:"3px"}}>EFFECT</div>
          <p className="detail-description">{inspectItem.effect || inspectItem.desc || "Standard adventurer item."}</p>
        </div>
        <div className="modal-foot">
          <button onClick={()=>setInspectItem(null)}>Close</button>
          <button className="gold" onClick={()=>{useItem(inspectItem);setInspectItem(null);}}>Use Now</button>
        </div>
      </motion.div>
    </div>}
  </PageContainer>
}

function ShopPage({data,setData,redeemReward,doToast}){
  const [category,setCategory]=useState("All");
  const [newReward,setNewReward]=useState({name:"",cost:"",category:"Custom rewards"});
  const rewards=data.rewards.filter(r=>category==="All"||r.category===category);
  async function handleCreateReward(){
    if(!newReward.name||!newReward.cost)return;
    try {
      const res = await apiPost('/shop', {
        name: newReward.name,
        cost: Number(newReward.cost),
        category: newReward.category,
        description: "Custom reward"
      });
      if(res?.reward) {
        setData(d=>({...d,rewards:[...d.rewards, res.reward]}));
      }
      setNewReward({name:"",cost:"",category:"Custom rewards"});
      doToast("Reward created","Your custom reward is now in the shop.");
    } catch(e) {
      doToast("Could not create reward", e.message);
    }
  }
  return <PageContainer title="Reward Shop" subtitle="Spend your virtual economy on meaningful real-world rewards.">
    <div className="shop-header"><div className="coin-display"><Coins/><strong>{data.profile.coins.toLocaleString()}</strong><span>coins available</span></div><div className="page-toolbar">{"All,Food,Entertainment,Gaming,Shopping,Relaxation,Travel,Experiences,Custom rewards".split(",").map(c=><button className={category===c?"filter active":"filter"} onClick={()=>setCategory(c)} key={c}>{c}</button>)}</div></div>
    <div className="shop-grid">{rewards.map(r=><section className="panel reward-card" key={r.id}><div className="reward-icon"><Gift size={25}/></div><div><span>{r.category}</span><h3>{r.name}</h3><p>{r.desc}</p></div><div className="reward-bottom"><b>{r.cost.toLocaleString()} coins</b><button className="gold" disabled={data.profile.coins<r.cost} onClick={()=>redeemReward(r)}>Redeem</button></div></section>)}</div>
    <section className="panel create-reward"><SectionHead title="Create your own reward"/><div className="form-grid"><input placeholder="Reward name" value={newReward.name} onChange={e=>setNewReward(v=>({...v,name:e.target.value}))}/><input placeholder="Price" type="number" value={newReward.cost} onChange={e=>setNewReward(v=>({...v,cost:e.target.value}))}/><select value={newReward.category} onChange={e=>setNewReward(v=>({...v,category:e.target.value}))}><option>Food</option><option>Entertainment</option><option>Gaming</option><option>Shopping</option><option>Travel</option><option>Custom rewards</option></select><button className="gold" onClick={handleCreateReward}>Create Reward</button></div></section>
  </PageContainer>
}

function SocialPage({data,doToast,setData,backendReady}){
  const [tab,setTab]=useState("Home");
  const [social,setSocial]=useState({friends:[],requests:[],feed:[],leaderboard:[],challenges:[],notifications:[]});
  const [search,setSearch]=useState("");
  const [results,setResults]=useState({people:[],challenges:[],groups:[]});
  const [comment,setComment]=useState({});
  const [challengeForm,setChallengeForm]=useState({title:"",description:"",type:"CUSTOM",days:7});
  const [guildForm,setGuildForm]=useState({name:"",description:""});
  const [sharedGoalForm,setSharedGoalForm]=useState({title:"",target:100,unit:"hours"});
  const [loading,setLoading]=useState(false);
  const refresh=()=>apiGet("/social/home").then(setSocial).catch(e=>doToast("Social offline",e.message));
  useEffect(()=>{if(backendReady)refresh()},[backendReady]);
  useEffect(()=>{if(!backendReady)return; const t=setTimeout(()=>{if(search.trim().length>=2)apiGet(`/social/search?q=${encodeURIComponent(search)}`).then(setResults).catch(()=>{}); else setResults({people:[],challenges:[],groups:[]});},220); return()=>clearTimeout(t)},[search,backendReady]);
  async function act(fn,success){setLoading(true);try{await fn();await refresh();doToast("Social updated",success)}catch(e){doToast("Action failed",e.message)}finally{setLoading(false)}}
  const rows=(social.leaderboard&&social.leaderboard.length?social.leaderboard:[...social.friends,{id:"me",name:"You",level:data.profile.level,xp:data.profile.xp}]).map(r=>({...r,xp:Number(r.xp)||0,level:Number(r.level)||1,streak:Number(r.streak)||0})).sort((a,b)=>b.xp-a.xp);
  const addFriend=id=>act(()=>apiPost("/social/friends/request",{receiverId:id}),"Friend request sent");
  const respond=(id,action)=>act(()=>apiPost("/social/friends/respond",{requestId:id,action}),action==="accept"?"Friend request accepted":`Request ${action}ed`);
  const react=(postId,type)=>act(()=>apiPost("/social/react",{postId,reactionType:type}),"Reaction saved");
  const addComment=postId=>{if(!comment[postId]?.trim())return;act(()=>apiPost("/social/comment",{postId,content:comment[postId]}).then(()=>setComment(c=>({...c,[postId]:""}))),"Comment added")};
  const nudge=id=>act(()=>apiPost("/social/nudge",{receiverId:id,message:"🔥 Keep going! Let's get today's XP."}),"Nudge sent");
  const createChallenge=()=>act(()=>apiPost("/social/challenges",{...challengeForm,days:Number(challengeForm.days)}).then(()=>setChallengeForm({title:"",description:"",type:"CUSTOM",days:7})),"Challenge created");
  const join=id=>act(()=>apiPost(`/social/challenges/${id}/join`,{}),"Challenge joined");
  const createGuild=()=>act(()=>apiPost("/social/guilds",guildForm).then(()=>setGuildForm({name:"",description:""})),"Guild created");
  const createGoal=()=>act(()=>apiPost("/social/shared-goals",{...sharedGoalForm,target:Number(sharedGoalForm.target)}).then(()=>setSharedGoalForm({title:"",target:100,unit:"hours"})),"Shared goal created");
  const pageTabs=["Home","Friends","Requests","Find People","Activity","Challenges","Leaderboards","Notifications"];
  return <PageContainer title="Social" subtitle="Friends, activity, challenges, competition, groups, chat, support and shared progression.">
    {!backendReady&&<section className="panel social-warning"><b>PostgreSQL backend not connected.</b><span>Start the server and initialize PostgreSQL to enable social actions.</span></section>}
    <div className="page-toolbar social-tabs">{pageTabs.map(x=><button key={x} className={tab===x?"filter active":"filter"} onClick={()=>setTab(x)}>{x}</button>)}</div>
    {tab==="Home"&&<div className="social-home-grid">
      <section className="panel social-summary"><SectionHead title="Social Home"/><div className="social-stat-cards"><div><Users/><b>{social.friends.length}</b><span>Friends</span></div><div><Bell/><b>{social.requests.filter(r=>r.status==='PENDING').length}</b><span>Requests</span></div><div><Trophy/><b>{social.challenges.length}</b><span>Challenges</span></div><div><Activity/><b>{social.feed.length}</b><span>Activity</span></div></div><div className="social-friend-list">{social.friends.slice(0,4).map(f=><div className="friend-row" key={f.id}><div className="avatar-text">{f.name[0]}</div><div><b>{f.name}</b><span>Level {f.level} • {f.xp.toLocaleString()} XP</span></div><button onClick={()=>nudge(f.id)}>Nudge</button></div>)}</div></section>
      <section className="panel leaderboard-card"><SectionHead title="Friend Leaderboard" action={<button className="link" onClick={()=>setTab("Leaderboards")}>View full →</button>}/><div className="leaderboard-table">{rows.slice(0,5).map((r,i)=><div className={`leaderboard-row ${r.name==="You"?"me":""}`} key={r.id||r.name}><div className={`leader-rank rank-${i+1}`}>{i<3?["🥇","🥈","🥉"][i]:`#${i+1}`}</div><div className="leader-player"><div className="avatar-text">{r.name?.[0]||"?"}</div><div><b>{r.name}</b><span>Level {r.level} · {r.streak?`${r.streak} day streak`:`${r.xp.toLocaleString()} XP`}</span></div></div><div className="leader-xp"><strong>{r.xp.toLocaleString()}</strong><span>XP</span></div></div>)}</div></section>
      <section className="panel social-feed-preview"><SectionHead title="Recent Activity" action={<button className="link" onClick={()=>setTab("Activity")}>View all →</button>}/>{social.feed.slice(0,5).map(post=><SocialPost key={post.id} post={post} onReact={react} comment={comment[post.id]||""} setComment={v=>setComment(c=>({...c,[post.id]:v}))} onComment={()=>addComment(post.id)}/>)}</section>
      <section className="panel"><SectionHead title="Quick Actions"/><div className="quick-social-actions"><button className="gold" onClick={()=>setTab("Find People")}>Find Friends</button><button onClick={()=>setTab("Requests")}>Friend Requests</button><button onClick={()=>setTab("Challenges")}>Create Challenge</button><button onClick={()=>setTab("Leaderboards")}>View Rankings</button></div></section>
    </div>}
    {tab==="Friends"&&<section className="panel"><SectionHead title={`Friends (${social.friends.length})`}/><div className="social-list-grid">{social.friends.map(f=><div className="panel inner-social-card" key={f.id}><div className="avatar-text">{f.name[0]}</div><div><h3>{f.name}</h3><p>Level {f.level} • {Number(f.xp).toLocaleString()} XP</p></div><div className="social-card-actions"><button onClick={()=>nudge(f.id)}>Nudge</button><button onClick={()=>doToast("Challenge",`Challenge ${f.name} from the Challenges tab.`)}>Challenge</button><button onClick={()=>doToast("Messaging",`Direct messages with ${f.name} are stored in PostgreSQL.`)}>Message</button></div></div>)}</div></section>}
    {tab==="Requests"&&<div className="social-two-col"><section className="panel"><SectionHead title="Incoming / Sent Requests"/>{social.requests.length===0?<div className="empty-state">No pending friend requests.</div>:social.requests.map(r=><div className="request-row" key={r.id}><div className="avatar-text">{r.name[0]}</div><div><b>{r.name}</b><span>Level {r.level} • {Number(r.xp).toLocaleString()} XP</span></div><div>{r.status==='PENDING'?(r.is_incoming?<button className="gold" onClick={()=>respond(r.id,"accept")}>Accept</button>:null):null}<button onClick={()=>respond(r.id,r.is_incoming?"decline":"cancel")}>{r.is_incoming?"Decline":"Cancel"}</button></div></div>)}</section></div>}
    {tab==="Find People"&&<section className="panel"><SectionHead title="Find People"/><div className="social-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search username, display name, user ID or friend code..."/></div><div className="search-sections"><div><h3>People</h3>{results.people.map(p=><div className="search-result" key={p.id}><div className="avatar-text">{p.name[0]}</div><div><b>{p.name}</b><span>@{p.username} • Level {p.level} • {Number(p.xp).toLocaleString()} XP</span><small>Friend code: {p.friend_code}</small></div><button className="gold" onClick={()=>addFriend(p.id)}>+ Add Friend</button></div>)}</div><div><h3>Challenges</h3>{results.challenges.map(c=><div className="search-result" key={c.id}><div><b>{c.title}</b><span>{c.type} • {c.status}</span><small>{c.description}</small></div></div>)}</div><div><h3>Groups / Guilds</h3>{results.groups.map(g=><div className="search-result" key={g.id}><div><b>{g.name}</b><span>Level {g.level} • {Number(g.xp).toLocaleString()} XP</span><small>{g.description}</small></div></div>)}</div></div></section>}
    {tab==="Activity"&&<section className="panel"><SectionHead title="Activity Feed"/><div>{social.feed.map(post=><SocialPost key={post.id} post={post} onReact={react} comment={comment[post.id]||""} setComment={v=>setComment(c=>({...c,[post.id]:v}))} onComment={()=>addComment(post.id)}/>)}</div></section>}
    {tab==="Challenges"&&<div className="social-two-col"><section className="panel"><SectionHead title="Discover Challenges"/><div className="challenge-grid">{social.challenges.map(c=><div className="challenge" key={c.id}><div className="challenge-icon"><Trophy/></div><div><h3>{c.title}</h3><p>{c.type} • {c.participants||0} participants</p><p>{c.description}</p><span>Reward: {typeof c.reward==='object'?JSON.stringify(c.reward):c.reward}</span></div><button className="gold" onClick={()=>join(c.id)}>Join</button></div>)}</div></section><section className="panel"><SectionHead title="Create Challenge"/><div className="form-grid"><input placeholder="Challenge title" value={challengeForm.title} onChange={e=>setChallengeForm(x=>({...x,title:e.target.value}))}/><textarea placeholder="Description" value={challengeForm.description} onChange={e=>setChallengeForm(x=>({...x,description:e.target.value}))}/><select value={challengeForm.type} onChange={e=>setChallengeForm(x=>({...x,type:e.target.value}))}>{["XP","QUEST","STREAK","FOCUS","STUDY","FITNESS","CUSTOM"].map(x=><option key={x}>{x}</option>)}</select><input type="number" min="1" value={challengeForm.days} onChange={e=>setChallengeForm(x=>({...x,days:e.target.value}))}/><button className="gold" disabled={loading||!challengeForm.title.trim()} onClick={createChallenge}>Create Challenge</button></div></section></div>}
    {tab==="Leaderboards"&&<div className="leaderboard-grid"><section className="panel leaderboard-large"><SectionHead title="Global Leaderboard" text="Climb through the ranks by earning verified XP."/><div className="leaderboard-table leaderboard-full">{rows.map((r,i)=><div className={`leaderboard-row ${r.name==="You"?"me":""}`} key={r.id||r.name}><div className={`leader-rank rank-${i+1}`}>{i<3?["🥇","🥈","🥉"][i]:`#${i+1}`}</div><div className="leader-player"><div className="avatar-text">{r.name?.[0]||"?"}</div><div><b>{r.name}</b><span>Level {r.level} · {r.streak?`${r.streak} day streak`:`${r.xp.toLocaleString()} XP`}</span></div></div><div className="leader-progress"><div className="slim"><i style={{width:`${Math.min(100,Math.round((r.xp/Math.max(1,rows[0]?.xp||1))*100))}%`}}/></div><small>{r.xp.toLocaleString()} XP</small></div></div>)}</div></section><section className="panel"><SectionHead title="League System" text="Weekly progression tiers."/><div className="league-path">{["BRONZE","SILVER","GOLD","PLATINUM","DIAMOND","MASTER","LEGEND"].map((x,i)=><div key={x} className={i===0?"league active":"league"}><span>{x}</span><small>{i<3?"Promotion tier":"Elite tier"}</small></div>)}</div></section></div>}
    {tab==="Notifications"&&<section className="panel"><SectionHead title="Social Notifications"/><div className="notification-list">{social.notifications.length===0?<div className="empty-state">No social notifications.</div>:social.notifications.map(n=><div className={`social-notification ${n.is_read?"":"unread"}`} key={n.id}><Bell size={16}/><div><b>{n.type.replaceAll('_',' ')}</b><span>{n.message}</span><small>{new Date(n.created_at).toLocaleString()}</small></div></div>)}</div></section>}
    <section className="panel social-expansion"><SectionHead title="Social RPG Expansion"/><div className="social-expansion-grid"><div><b>Guilds</b><span>Create guilds, group memberships and group challenges in PostgreSQL.</span><button onClick={()=>doToast("Guilds","Guild tables and APIs are ready.")}>Open Guilds</button></div><div><b>Shared Goals</b><span>Work together toward XP, hours, quests or milestone targets.</span><button onClick={()=>{const title=prompt("Shared goal title"); if(title) setSharedGoalForm(x=>({...x,title}))}}>Create Shared Goal</button></div><div><b>Shared Goal Target</b><span>{sharedGoalForm.title||"No goal draft"} • {sharedGoalForm.target} {sharedGoalForm.unit}</span><button onClick={()=>{if(!sharedGoalForm.title.trim())return doToast("Shared goal","Create a goal title first.");createGoal()}}>Save Goal</button></div><div><b>Create Guild</b><input value={guildForm.name} onChange={e=>setGuildForm(x=>({...x,name:e.target.value}))} placeholder="Guild name"/><input value={guildForm.description} onChange={e=>setGuildForm(x=>({...x,description:e.target.value}))} placeholder="Guild description"/><button onClick={createGuild}>Create Guild</button></div></div></section>
  </PageContainer>
}

function SocialPost({post,onReact,comment,setComment,onComment}){
  return <article className="social-post"><div className="social-post-top"><div className="avatar-text">{post.name?.[0]||"?"}</div><div><b>{post.name}</b><span>{post.type?.replaceAll('_',' ')} • {new Date(post.created_at).toLocaleString()}</span></div></div><p>{post.content}</p><div className="reaction-row"><button onClick={()=>onReact(post.id,"FIRE")}>🔥 Fire</button><button onClick={()=>onReact(post.id,"CLAP")}>👏 Clap</button><button onClick={()=>onReact(post.id,"STRONG")}>💪 Strong</button><button onClick={()=>onReact(post.id,"VICTORY")}>🏆 Victory</button><small>{post.reactions||0} reactions • {post.comments||0} comments</small></div><div className="comment-row"><input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Write a supportive comment..."/><button onClick={onComment}>Comment</button></div></article>
}

function CalendarPage({data,selectedDay,setSelectedDay,setPage,setHistoryDate,doToast}){
  const now=new Date();
  const todayKey=localDateKey(now);
  const monthYearKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const displayedYear=now.getFullYear();
  const displayedMonth=now.getMonth();
  const handleDate=(day)=>{
    if(!day || day>new Date(displayedYear,displayedMonth+1,0).getDate()) return;
    const key=`${displayedYear}-${String(displayedMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    if(key===todayKey){
      setSelectedDay(day);
      setPage("Quests");
      return;
    }
    if(key>todayKey){
      doToast("Invalid date",`${formatDateKey(key)} is in the future. Future dates cannot be opened yet.`);
      return;
    }
    setSelectedDay(day);
    setHistoryDate(key);
    setPage("History");
  };
  return <PageContainer title="Calendar & Heatmap" subtitle="Visualize quest completion, habits, XP, coins, streaks and focus sessions.">
    <div className="calendar-layout">
      <section className="panel calendar-large">
        <SectionHead title={now.toLocaleDateString([], {month:"long",year:"numeric"})} action={<div className="calendar-actions"><button>Day</button><button>Week</button><button className="active">Month</button></div>}/>
        <div className="calendar-full-grid">
          { (data.settings?.weekStart === "Sunday" ? ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"] : ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]).map(d=><b key={d}>{d}</b>) }
          {Array.from({length:35},(_,i)=>{
            const day=i+1;
            const valid=day<=new Date(displayedYear,displayedMonth+1,0).getDate();
            const key=valid?`${displayedYear}-${String(displayedMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`:null;
            const future=Boolean(key&&key>todayKey);
            return <button key={i} className={`${day===selectedDay?"day selected":"day"} ${future?"future-day":""} ${key===todayKey?"today-day":""}`} onClick={()=>handleDate(day)} disabled={!valid}>{valid?day:""}</button>;
          })}
        </div>
        <div className="calendar-hint">Today opens your active quests. Previous dates open dated history. Future dates are unavailable.</div>
      </section>
      <section className="panel day-details">
        <SectionHead title={`${selectedDay} ${now.toLocaleDateString([], {month:"long"})}`}/>
        <div className="day-stat"><b>Click a date to continue</b><span>Today → Quests · Past → History</span></div>
        <div className="day-stat"><b>{data.quests.filter(q=>q.status==="Completed").length} completed</b><span>Current quest list</span></div>
        <div className="day-stat"><b>{data.profile.xp.toLocaleString()} XP</b><span>Current total</span></div>
        <div className="day-stat"><b>{data.profile.coins.toLocaleString()} coins</b><span>Current balance</span></div>
      </section>
    </div>
  </PageContainer>
}

function HistoryPage({data,setModal,historyDate}){
  const activities=Array.isArray(data.activity)?data.activity:[];
  const filteredActivities=historyDate
    ? activities.filter(a=>a.dateKey===historyDate || (a.occurredAt&&localDateKey(a.occurredAt)===historyDate))
    : activities;
  const datedQuests=historyDate
    ? data.quests.filter(q=>q.completedAt && localDateKey(q.completedAt)===historyDate)
    : [];
  const openEntry=(a)=>{
    const questId=a.questId||a.meta?.questId;
    const quest=questId?data.quests.find(q=>q.id===questId):data.quests.find(q=>String(a.text||"").includes(q.title));
    setModal({type:"history",activity:a,quest:quest||null});
  };
  return <PageContainer title="History" subtitle={historyDate?`Activity recorded on ${formatDateKey(historyDate)}.`:"Review your activity and revisit the details of past quests."}>
    {historyDate&&<section className="panel history-date-banner"><b>{formatDateKey(historyDate)}</b><span>Past activity & completed quests</span></section>}
    <section className="panel history-page-card">
      <SectionHead title={historyDate?"Quest & Activity History":"Activity History"}/>
      {historyDate&&<div className="history-day-quests">
        {datedQuests.length>0?<>{datedQuests.map(q=><button key={q.id} className="history-quest-card" onClick={()=>setModal({type:"history",activity:{id:`quest-${q.id}`,kind:"Quest",text:`Completed ${q.title}`,value:`+${q.awardedXp||q.xp} XP • +${q.awardedCoins||q.coins} coins`,time:formatDateKey(historyDate),questId:q.id,dateKey:historyDate},quest:q})}><div><b>{q.title}</b><small>{q.category} · {q.difficulty} · {Math.round((q.completionRatio||1)*100)}% complete</small></div><strong>View details →</strong></button>)}</>:<div className="history-empty-day">No completed quests were recorded for this date.</div>}
      </div>}
      <div className="history-list">
        {filteredActivities.length>0?filteredActivities.map(a=><button className="history-item" key={a.id} onClick={()=>openEntry(a)}>
          <span className="history-item-icon">{a.kind==="XP"?<Zap size={18}/>:a.kind==="Coins"?<Coins size={18}/>:a.kind==="Achievement"?<Award size={18}/>:a.kind==="Stats"?<BarChart3 size={18}/>:<ListChecks size={18}/>}</span>
          <span className="history-item-main"><b>{a.text}</b><small>{a.kind} · {a.time}</small></span>
          <strong>{a.value||"View details"}</strong><ChevronRight size={18}/>
        </button>):<div className="history-empty-day">No activity was recorded for this date.</div>}
      </div>
    </section>
  </PageContainer>
}

function SettingsPage({data,setData,doToast,handleLogout}){
  const [showDeleteModal, setShowDeleteModal]=useState(false);
  const [deletePassword, setDeletePassword]=useState("");
  const [deleteLoading, setDeleteLoading]=useState(false);
  const [deleteError, setDeleteError]=useState("");

  const patch=async(key,value)=>{
    setData(d=>({...d,settings:{...d.settings,[key]:value}}));
    try {
      await apiPatch('/settings', { [key]: value });
      doToast("Setting updated",`${key} saved to cloud.`);
    } catch(e) {
      doToast("Setting update failed", e.message);
    }
  };
  const cycleDifficulty=()=>patch("difficulty", data.settings.difficulty==="Easy"?"Adaptive":data.settings.difficulty==="Adaptive"?"Hard":"Easy");
  const cycleTime=()=>patch("timeFormat", data.settings.timeFormat==="12h"?"24h":"12h");
  const cycleWeek=()=>patch("weekStart", data.settings.weekStart==="Monday"?"Sunday":"Monday");
  const reset=()=>{if(window.confirm("Reset all local cache?")){localStorage.removeItem(LS);window.location.reload()}};
  
  const onLogout = handleLogout || (async()=>{
    try { await apiPost('/auth/logout', {}); } catch {}
    clearToken();
    localStorage.removeItem(LS);
    window.location.href = "/page1.html";
  });

  const handleDeleteAccount = async()=>{
    if (!deletePassword) {
      setDeleteError("Password is required to delete your account.");
      return;
    }
    setDeleteLoading(true);
    setDeleteError("");
    try {
      await apiPost('/auth/account', { password: deletePassword }, { method: 'DELETE' }).catch(async () => {
        // Fallback to fetch directly if apiPost does not support DELETE method override
        const token = getToken();
        const res = await fetch('/api/auth/account', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ password: deletePassword })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to delete account.');
        return data;
      });
      clearToken();
      localStorage.removeItem(LS);
      alert("Your account has been deleted permanently.");
      window.location.href = "/page1.html";
    } catch(err) {
      setDeleteError(err.message || "Failed to delete account.");
      setDeleteLoading(false);
    }
  };

  return <PageContainer title="Settings" subtitle="Account, preferences, gameplay and privacy controls.">
    <div className="settings-grid">
      <section className="panel settings-card"><SectionHead title="Account"/>
        <div className="setting-line"><span>Username</span><b>{data.profile.username || data.profile.name || "Adventurer"}</b></div>
        <div className="setting-line"><span>Email</span><b>{data.profile.email || "Registered User"}</b></div>
        <div className="setting-line"><span>Password</span><b>••••••••</b><button onClick={()=>doToast("Password","Password secured with scrypt hashing.")}>Protected</button></div>
        <div className="setting-line"><span>Session</span><b>Active</b><button onClick={onLogout}>Logout</button></div>
      </section>
      <section className="panel settings-card"><SectionHead title="Preferences"/>
        <div className="setting-line"><span>Theme</span><b>Dark</b><button onClick={()=>doToast("Theme","Dark is the active LIFE RPG theme.")}>Active</button></div>
        <div className="setting-line"><span>Sounds</span><b>{data.settings.sounds?"On":"Off"}</b><button onClick={()=>patch("sounds",!data.settings.sounds)}>{data.settings.sounds?"Turn Off":"Turn On"}</button></div>
        <div className="setting-line"><span>Animations</span><b>{data.settings.animations?"On":"Off"}</b><button onClick={()=>patch("animations",!data.settings.animations)}>{data.settings.animations?"Turn Off":"Turn On"}</button></div>
        <div className="setting-line"><span>Time format</span><b>{data.settings.timeFormat}</b><button onClick={cycleTime}>Change</button></div>
        <div className="setting-line"><span>Week starts</span><b>{data.settings.weekStart||"Monday"}</b><button onClick={cycleWeek}>Change</button></div>
      </section>
      <section className="panel settings-card"><SectionHead title="Gameplay"/>
        <div className="setting-line"><span>Difficulty preference</span><b>{data.settings.difficulty||"Adaptive"}</b><button onClick={cycleDifficulty}>Change</button></div>
        <div className="setting-line"><span>XP animation</span><b>{data.settings.xpAnimation===false?"Off":"On"}</b><button onClick={()=>patch("xpAnimation",data.settings.xpAnimation===false?true:false)}>{data.settings.xpAnimation===false?"Turn On":"Turn Off"}</button></div>
        <div className="setting-line"><span>Quest reminders</span><b>{data.settings.questReminders===false?"Off":"On"}</b><button onClick={()=>patch("questReminders",data.settings.questReminders===false?true:false)}>{data.settings.questReminders===false?"Turn On":"Turn Off"}</button></div>
        <div className="setting-line"><span>Streak protection</span><b>{data.settings.streakProtection||"Ask first"}</b><button onClick={()=>patch("streakProtection",data.settings.streakProtection==="Ask first"?"Auto protect":"Ask first")}>Change</button></div>
      </section>
      <section className="panel settings-card"><SectionHead title="Privacy"/>
        <div className="setting-line"><span>Profile visibility</span><b>{data.settings.profileVisible?"Public":"Private"}</b><button onClick={()=>patch("profileVisible",!data.settings.profileVisible)}>Toggle</button></div>
        <div className="setting-line"><span>Leaderboard visibility</span><b>{data.settings.leaderboardVisible?"Visible":"Hidden"}</b><button onClick={()=>patch("leaderboardVisible",!data.settings.leaderboardVisible)}>Toggle</button></div>
        <div className="setting-line"><span>History visibility</span><b>Private to you</b><button onClick={()=>doToast("History privacy","Your history is private to your account.")}>Manage</button></div>
        <div className="setting-line"><span>Social settings</span><b>Friends only</b><button onClick={()=>doToast("Social privacy","Social visibility is currently friends only.")}>Manage</button></div>
      </section>
    </div>
    <section className="panel danger-zone">
      <SectionHead title="Danger Zone"/>
      <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap",marginTop:"6px"}}>
        <button className="danger-btn" onClick={reset}>Reset local cache</button>
        <button className="danger-btn" onClick={()=>{setDeleteError("");setDeletePassword("");setShowDeleteModal(true);}}>Delete Account</button>
      </div>
    </section>

    {showDeleteModal && <div className="modal-backdrop" onClick={()=>setShowDeleteModal(false)}>
      <motion.div className="modal" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} onClick={e=>e.stopPropagation()} style={{maxWidth:"460px"}}>
        <div className="modal-head">
          <div><span className="eyebrow" style={{color:"#ef8888"}}>DANGER ZONE</span><h2>Delete Account</h2></div>
          <button onClick={()=>setShowDeleteModal(false)}><X/></button>
        </div>
        <p style={{fontSize:"8px",color:"#d09292",lineHeight:"1.5",marginTop:"4px"}}>
          WARNING: This action is permanent and irreversible. All your profile stats, quests, history, inventory, and progression in PostgreSQL will be erased.
        </p>
        <div style={{marginTop:"10px"}}>
          <label style={{fontSize:"8px",color:"#b5c0c5",display:"block",marginBottom:"4px"}}>Confirm your password to proceed:</label>
          <input
            type="password"
            placeholder="Enter your account password"
            value={deletePassword}
            onChange={e=>setDeletePassword(e.target.value)}
            style={{width:"100%",padding:"8px",background:"#0a161b",border:"1px solid #3c2427",borderRadius:"7px",color:"#fff",fontSize:"9px"}}
          />
        </div>
        {deleteError && <div style={{color:"#f87171",fontSize:"7px",marginTop:"6px"}}>{deleteError}</div>}
        <div className="modal-foot" style={{marginTop:"14px"}}>
          <button onClick={()=>setShowDeleteModal(false)}>Cancel</button>
          <button className="danger-btn" onClick={handleDeleteAccount} disabled={deleteLoading || !deletePassword}>
            {deleteLoading ? "Deleting..." : "Permanently Delete"}
          </button>
        </div>
      </motion.div>
    </div>}
  </PageContainer>
}

function PageContainer({title,subtitle,children}){return <div className="page-container"><div className="page-title"><span className="eyebrow">LIFE RPG</span><h1>{title}</h1><p>{subtitle}</p></div>{children}</div>}

function HistoryQuestModal({activity,quest,close}){
  return <div className="modal-backdrop" onClick={close}><motion.div className="modal history-quest-modal" initial={{opacity:0,y:18,scale:.98}} animate={{opacity:1,y:0,scale:1}} onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><div><span className="eyebrow">PAST ACTIVITY</span><h2>Quest Details</h2></div><button onClick={close}><X/></button></div>
    <div className="history-quest-body">
      <div className="history-summary"><span className="history-kind">{activity?.kind||"Quest"}</span><h3>{quest?.title||activity?.text||"Activity"}</h3><p>{quest?.description||"This activity was recorded in your LIFE RPG history."}</p></div>
      {quest ? <div className="detail-grid"><div><span>CATEGORY</span><b>{quest.category}</b></div><div><span>DIFFICULTY</span><b>{quest.difficulty}</b></div><div><span>DURATION</span><b>{Math.floor((quest.elapsed||0)/60)} / {quest.duration} min</b></div><div><span>DEADLINE</span><b>{quest.deadline}</b></div><div><span>XP AWARDED</span><b>+{quest.awardedXp ?? quest.xp} XP</b></div><div><span>COINS AWARDED</span><b>+{quest.awardedCoins ?? quest.coins} coins</b></div><div><span>STAT AWARDED</span><b>+{quest.awardedStatReward ?? quest.statReward} {quest.stat}</b></div><div><span>STATUS</span><b>{quest.status} • {Math.round((quest.completionRatio||1)*100)}%</b></div></div> : <div className="history-fallback"><b>{activity?.value||"Recorded activity"}</b><span>{activity?.time||""}</span></div>}
    </div>
  </motion.div></div>
}

function Modal({type,quest,activity,close,data,setData,doToast}){
  if(type==="history") return <HistoryQuestModal activity={activity} quest={quest} close={close}/>;
  const initial=quest||{
    title:"",description:"",category:"Study",difficulty:"Normal",duration:30,deadline:"Today",startDate:"",
    recurrence:"One-time",priority:"Medium",xp:60,coins:30,stat:"Intelligence",statReward:1,tags:[],
    subtasks:[],targetType:"Time",target:30,reminder:"None",time:"",location:"",private:false,status:"Available",progress:0,elapsed:0
  };
  const [f,setF]=useState({...initial,tags:(initial.tags||[]).join(","),subtasks:(initial.subtasks||[]).join(",")});
  const save=async()=>{
    const q={...f,duration:Number(f.duration)||1,xp:Number(f.xp)||xpForQuest(f),coins:Number(f.coins)||Math.round((Number(f.xp)||xpForQuest(f))*.5),statReward:Number(f.statReward)||0,tags:f.tags.split(",").map(x=>x.trim()).filter(Boolean),subtasks:f.subtasks.split(",").map(x=>x.trim()).filter(Boolean)};
    try{
      const out=q.id ? await apiPut(`/quests/${q.id}`,q) : await apiPost('/quests',q);
      const savedQuest=out?.quest;
      if(!savedQuest) throw new Error('Quest was not returned by the server');
      setData(d=>{
        const exists=d.quests.some(x=>x.id===savedQuest.id);
        return {...d,quests:exists?d.quests.map(x=>x.id===savedQuest.id?{...x,...savedQuest}:x):[savedQuest,...d.quests]};
      });
      doToast(q.id?"Quest updated":"Quest created",savedQuest.title);close();
    }catch(e){
      doToast("Could not save quest",e.message||"The server rejected this quest.");
    }
  };
  return <div className="modal-backdrop"><motion.div className="modal large" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}}><div className="modal-head"><div><span className="eyebrow">QUEST CONFIGURATION</span><h2>{quest?"Edit Quest":"Create Quest"}</h2></div><button onClick={close}><X/></button></div><div className="form-grid three">
    <label>Quest name<input value={f.title} onChange={e=>setF(x=>({...x,title:e.target.value}))}/></label>
    <label>Category<select value={f.category} onChange={e=>setF(x=>({...x,category:e.target.value}))}>{["Health","Fitness","Study","Learning","Career","Work","Coding","Reading","Finance","Personal Development","Sleep","Nutrition","Social","Family","Creativity","Hobbies","Sports","Self-Care","Chores","Spirituality","Travel","Communication"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Difficulty<select value={f.difficulty} onChange={e=>setF(x=>({...x,difficulty:e.target.value}))}>{["Easy","Normal","Hard","Epic","Legendary"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Description<textarea value={f.description} onChange={e=>setF(x=>({...x,description:e.target.value}))}/></label>
    <label>Duration (min)<input type="number" value={f.duration} onChange={e=>setF(x=>({...x,duration:e.target.value}))}/></label>
    <label>Deadline<input value={f.deadline} onChange={e=>setF(x=>({...x,deadline:e.target.value}))}/></label>
    <label>Start date<input type="date" value={f.startDate} onChange={e=>setF(x=>({...x,startDate:e.target.value}))}/></label>
    <label>Recurrence<select value={f.recurrence} onChange={e=>setF(x=>({...x,recurrence:e.target.value}))}>{["One-time","Daily","Weekly","Monthly","Weekdays","Custom"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Priority<select value={f.priority} onChange={e=>setF(x=>({...x,priority:e.target.value}))}>{["Low","Medium","High","Critical"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>XP reward<input type="number" value={f.xp} onChange={e=>setF(x=>({...x,xp:e.target.value}))}/></label>
    <label>Coin reward<input type="number" value={f.coins} onChange={e=>setF(x=>({...x,coins:e.target.value}))}/></label>
    <label>Improves stat<select value={f.stat} onChange={e=>setF(x=>({...x,stat:e.target.value}))}>{["Intelligence","Strength","Vitality","Discipline","Agility","Charisma","Wealth"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Stat reward<input type="number" value={f.statReward} onChange={e=>setF(x=>({...x,statReward:e.target.value}))}/></label>
    <label>Target type<select value={f.targetType} onChange={e=>setF(x=>({...x,targetType:e.target.value}))}>{["Time","Count","Quantity","Percentage","Milestone"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Target<input type="number" value={f.target} onChange={e=>setF(x=>({...x,target:e.target.value}))}/></label>
    <label>Reminder<select value={f.reminder} onChange={e=>setF(x=>({...x,reminder:e.target.value}))}>{["None","At start","15 min before","30 min before","1 hour before"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Time<input type="time" value={f.time} onChange={e=>setF(x=>({...x,time:e.target.value}))}/></label>
    <label>Location<input value={f.location} onChange={e=>setF(x=>({...x,location:e.target.value}))} placeholder="Optional"/></label>
    <label>Tags<input value={f.tags} onChange={e=>setF(x=>({...x,tags:e.target.value}))} placeholder="comma separated"/></label>
    <label>Subtasks<input value={f.subtasks} onChange={e=>setF(x=>({...x,subtasks:e.target.value}))} placeholder="comma separated"/></label>
    <label className="checkbox"><input type="checkbox" checked={f.private} onChange={e=>setF(x=>({...x,private:e.target.checked}))}/> Private / personal</label>
  </div><div className="modal-foot"><button onClick={close}>Cancel</button><button className="gold" onClick={save}>Save Quest</button></div></motion.div></div>
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App/></React.StrictMode>);
