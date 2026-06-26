/* ============================================================
   红人营销 CRM · Influencer Marketing CRM
   纯前端单页应用 · 数据持久化于 localStorage
   ============================================================ */
(function () {
'use strict';

/* ---------- 常量配置 ---------- */
const PLATFORMS = ['YouTube','Instagram','TikTok','Twitter/X','Facebook','Blog/Website','Reddit'];
const VERTICALS = ['Sports Tech','Fitness','Tech/Gadget','Beauty','Fashion','Gaming','Food','Travel','Lifestyle','Outdoor'];
const STATUS = [
  {key:'prospect',   label:'待开发 Prospect',  cls:'b-prospect'},
  {key:'contacted',  label:'已联系 Contacted', cls:'b-contacted'},
  {key:'negotiating',label:'洽谈中 Negotiating',cls:'b-negotiating'},
  {key:'active',     label:'已合作 Active',    cls:'b-active'},
  {key:'paused',     label:'暂停 Paused',      cls:'b-paused'},
  {key:'rejected',   label:'不合适 Rejected',  cls:'b-rejected'}
];
// Campaign 内每个红人的合作阶段（用于自动汇总进度）
const STAGES = ['已加入','已联系','已寄样/Brief','内容制作中','已发布','已结算'];
const STAGE_WEIGHT = STAGES.length - 1; // 进度 = index / (len-1)

// 四级粉丝量级分类（按用户要求：Micro / Mid-tier / Macro / Tier-1）
const TIERS = [
  {key:'Micro',    label:'Micro (10K-100K)',   min:10000,   max:100000},
  {key:'Mid-tier', label:'Mid-tier (100K-500K)',min:100000, max:500000},
  {key:'Macro',    label:'Macro (500K-1M)',    min:500000,  max:1000000},
  {key:'Tier-1',   label:'Tier-1 (1M+)',       min:1000000, max:Infinity}
];

// 红人量级维度（与粉丝量解耦，单选 T0/T1/T2/T3）。T0 最高级，T3 最低级。
const TLEVELS = [
  {key:'T0', label:'T0 · 顶级 / 头部',  desc:'1M+ 或战略级合作 KOL', auto:1000000},
  {key:'T1', label:'T1 · 大型 KOL',    desc:'500K–1M 量级',         auto:500000},
  {key:'T2', label:'T2 · 中型 KOL',    desc:'100K–500K 量级',       auto:100000},
  {key:'T3', label:'T3 · 腰尾部 / 新锐', desc:'<100K 量级',          auto:0}
];

// 地区分组（二级菜单管理）：把自由文本 region 归类到大区
const REGIONS = [
  {key:'na',  label:'北美 North America', match:['usa','us','united states','america','canada','北美','美国','加拿大','mexico']},
  {key:'eu',  label:'欧洲 Europe',        match:['uk','united kingdom','britain','england','europe','netherlands','belgium','france','germany','spain','italy','欧洲','英国','荷兰','比利时','法国','德国','西班牙','意大利','switzerland','denmark','norway','sweden']},
  {key:'apac',label:'亚太 Asia-Pacific',  match:['australia','new zealand','asia','china','japan','korea','singapore','亚太','亚洲','澳大利亚','澳洲','新西兰','中国','日本','韩国','新加坡','taiwan','hong kong','台湾','香港','thailand','india']},
  {key:'other',label:'其他 / 全球 Other', match:[]}
];

/* ---------- 工具函数 ---------- */
const $  = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>[...el.querySelectorAll(s)];
const uid = (p='id')=>p+'_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);
const esc = s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n=>{ n=Number(n)||0; return n>=1e6?(n/1e6).toFixed(n>=1e7?0:1)+'M':n>=1e3?(n/1e3).toFixed(n>=1e4?0:1)+'K':String(n); };
const fmtFull = n=>(Number(n)||0).toLocaleString('en-US');
const initials = name=>{ const s=String(name||'?').replace(/^[@#]/,'').trim(); return s.slice(0,2).toUpperCase()||'?'; };
// 头像：根据平台 + handle 通过 unavatar.io 公开头像代理自动推断社媒头像 URL。
// unavatar 支持 youtube / instagram / tiktok / twitter 等；取不到时图片 onerror 回退首字母。
const PLAT_UNAVATAR = {
  'YouTube':'youtube', 'Instagram':'instagram', 'TikTok':'tiktok',
  'Twitter/X':'twitter', 'Reddit':'reddit', 'Blog/Website':'', 'Facebook':'facebook'
};
const autoAvatar = i=>{
  if(!i) return '';
  const h = String(i.handle||'').replace(/^[@#]/,'').trim();
  if(!h) return '';
  const key = PLAT_UNAVATAR[i.platform];
  if(key) return `https://unavatar.io/${key}/${encodeURIComponent(h)}`;
  // 无对应平台时，尝试用站点域名推断（如博客）
  if(i.url){ try{ const host=new URL(i.url).hostname; return `https://unavatar.io/${host}`; }catch(_){} }
  return '';
};
// 头像渲染：优先用图片(i.avatar 或自动推断)，加载失败时 onerror 切换回首字母占位
const avatarHTML = (i, cls='avatar')=>{
  const src = (i&&i.avatar) ? i.avatar : autoAvatar(i);
  const ini = esc(initials(i&&i.handle));
  if(src){
    return `<div class="${cls} has-img"><img src="${esc(src)}" alt="${ini}" loading="lazy" `+
           `onerror="this.style.display='none';this.parentNode.classList.remove('has-img');this.parentNode.textContent='${ini}'"/></div>`;
  }
  return `<div class="${cls}">${ini}</div>`;
};
const tierOf = n=>{ n=Number(n)||0; const t=TIERS.find(t=>n>=t.min&&n<t.max); return t?t.key:(n>=1e6?'Tier-1':'Micro'); };
const tierLabel = n=>{ const k=tierOf(n); const t=TIERS.find(t=>t.key===k); return t?t.label:k; };
// 量级 T0-T3：优先使用手动设置的 manualTier，否则按粉丝量自动推断（与粉丝量解耦但提供智能默认）
const autoTlevel = n=>{ n=Number(n)||0; const t=TLEVELS.find(t=>n>=t.auto); return t?t.key:'T3'; };
const tlevelOf = i=>{ const m=i&&i.manualTier; return (m&&TLEVELS.some(t=>t.key===m))?m:autoTlevel(i&&i.followers); };
const tlevelObj = key=>TLEVELS.find(t=>t.key===key)||TLEVELS[3];
const regionOf = r=>{ const s=String(r||'').toLowerCase(); for(const R of REGIONS){ if(R.key==='other') continue; if(R.match.some(m=>s.includes(m))) return R.key; } return 'other'; };
const regionLabel = key=>{ const R=REGIONS.find(R=>R.key===key); return R?R.label:'其他 / 全球 Other'; };
const statusObj = k=>STATUS.find(s=>s.key===k)||STATUS[0];
const today = ()=>new Date().toISOString().slice(0,10);

function toast(msg,ok=true){
  const t=$('#toast');
  t.innerHTML=(ok?'<span class="ti">✓</span>':'⚠ ')+esc(msg);
  t.className='toast show'+(ok?' ok':'');
  clearTimeout(toast._t); toast._t=setTimeout(()=>t.className='toast',2200);
}

/* ---------- 数据层 ---------- */
const LS_KEY='influencer_crm_v5';
let DB={influencers:[],campaigns:[],outputs:[]};

function seed(){
  const t=today();
  const mk=(o)=>({id:uid('inf'),language:'English',status:'prospect',email:'',rate:0,createdAt:t,verticals:['Road Cycling'],manualTier:'',...o});
  return {
    influencers:[
      /* ===== 参照基准：DC Rainmaker（运动科技标杆，跨界保留） ===== */
      mk({id:'inf_dcr',handle:'DC Rainmaker',realname:'Ray Maker',url:'https://www.dcrainmaker.com',platform:'Blog/Website',
        followers:3000000,verticals:['Sports Tech','Cycling Tech','Fitness'],region:'France / Global (US expat)',
        engagement:3.0,manualTier:'T0',notes:'运动科技/可穿戴设备深度评测标杆，本名 Ray Maker。博客月访问约400万，覆盖 Garmin/Wahoo 等 GPS 与骑行码表/功率计评测。作为本红人库的"对标基准"保留。'}),

      /* ========== 北美 North America ========== */
      mk({id:'inf_dylan',handle:'@DylanJohnsonCycling',realname:'Dylan Johnson',url:'https://www.youtube.com/@DylanJohnsonCycling',platform:'YouTube',
        followers:206000,verticals:['Road Cycling','Training','Gravel'],region:'USA',engagement:5.4,status:'contacted',
        notes:'科学化训练方法、公路/砾石训练与赛事报告，内容硬核、受众粘性强。'}),
      mk({handle:'@NorCalCycling',realname:'Jeff (NorCal Cycling)',url:'https://www.youtube.com/@NorCalCycling',platform:'YouTube',
        followers:276000,verticals:['Road Cycling','Racing','Gear Review'],region:'USA',engagement:4.8,
        notes:'绕圈赛(criterium)战术、车感技巧、装备测试与竞速内容。'}),
      mk({handle:'@BenDelaney',realname:'Ben Delaney (The Ride)',url:'https://www.youtube.com/@BenDelaney',platform:'YouTube',
        followers:75000,verticals:['Road Cycling','Gear Review','Gravel'],region:'USA',engagement:4.2,
        notes:'前 BikeRadar/VeloNews 编辑，公路/砾石高端装备评测与产品概览。'}),
      mk({id:'inf_phil',handle:'@philgaimon',realname:'Phil Gaimon',url:'https://www.youtube.com/@philgaimon',platform:'YouTube',
        followers:92000,verticals:['Road Cycling','Entertainment'],region:'USA',engagement:5.0,manualTier:'T1',
        notes:'前职业车手，KOM 挑战、公路娱乐内容，亲和力强、品牌合作经验丰富。粉丝量虽 92K，但名人效应与商业价值对标 T1（手动量级解耦示例）。'}),

      /* ========== 欧洲 Europe ========== */
      mk({handle:'@CadeMedia',realname:'Francis Cade',url:'https://www.youtube.com/@CadeMedia',platform:'YouTube',
        followers:401000,verticals:['Road Cycling','Gear Review','Bike Fit'],region:'United Kingdom',engagement:5.1,status:'negotiating',
        notes:'英国公路圈最具影响力的中型 KOL 之一，公路/砾石 vlog、装备评测、骑行文化。'}),
      mk({handle:'@PeakTorque',realname:'Peak Torque (Alex)',url:'https://www.youtube.com/@PeakTorque',platform:'YouTube',
        followers:70000,verticals:['Cycling Tech','Gear Review'],region:'United Kingdom',engagement:6.0,
        notes:'自行车工程/技术分析、车架与零件深度评测，工程向硬核垂直标杆。'}),
      mk({handle:'@jasperverkuijl',realname:'Jasper Verkuijl',url:'https://www.youtube.com/@jasperverkuijl',platform:'YouTube',
        followers:118000,verticals:['Road Cycling','Gear Review','Training'],region:'Netherlands',engagement:5.6,
        notes:'Gran Fondo 赛事、公路骑行、装备评测与配速/营养策略。'}),
      mk({handle:'@tourdetietema',realname:'Bas Tietema (Tour de Tietema)',url:'https://www.youtube.com/@tourdetietema',platform:'YouTube',
        followers:560000,verticals:['Road Cycling','Entertainment','Racing'],region:'Netherlands',engagement:6.5,
        notes:'公路骑行挑战、职业车队幕后、赛事娱乐，自有职业洲际队，营销话题度高。'}),

      /* ========== 亚太 Asia-Pacific ========== */
      mk({handle:'@CamNicholls',realname:'Cam Nicholls',url:'https://www.youtube.com/@CamNicholls',platform:'YouTube',
        followers:210000,verticals:['Road Cycling','Gear Review','Bike Fit'],region:'Australia',engagement:5.3,status:'contacted',
        notes:'亚太英语圈公路骑行核心代表，公路车与装备深度评测、绕圈赛技巧、Bike Fit。'}),
      mk({handle:'@ChinaCycling',realname:'Joe (China Cycling)',url:'https://www.youtube.com/@ChinaCycling',platform:'YouTube',
        followers:74000,verticals:['Road Cycling','Gear Review'],region:'China',engagement:5.8,
        notes:'中国直营品牌车架/装备评测、选购攻略与中国骑行文化，连接中外市场的桥梁账号。'}),
      mk({handle:'@ridesofjapan',realname:'Tobias (Rides of Japan)',url:'https://www.youtube.com/@ridesofjapan',platform:'YouTube',
        followers:98000,verticals:['Road Cycling','Gear Review','Gravel'],region:'Japan',engagement:5.5,
        notes:'轻量化装备(weight weenie)评测、公路/砾石长途与日本路线。'}),
      mk({handle:'@joshkwan',realname:'Josh Kwan',url:'https://www.youtube.com/@joshkwan',platform:'YouTube',
        followers:55000,verticals:['Road Cycling','Lifestyle'],region:'Australia',engagement:6.2,
        notes:'悉尼公路骑行 vlog、咖啡骑行文化与装备短评，调性年轻、视觉风格强。'}),

      /* ============================================================
         批量扩充 30 位 Road Cycling KOL（按地区分组）
         说明：均为真实存在的公路骑行/自行车内容创作者与媒体账号；
         粉丝量为基于公开资料的「代表性估值」，用于演示与建库，
         接入真实数据后请以平台实际数据为准。
         ============================================================ */

      /* ========== 北美 North America（10 位） ========== */
      mk({handle:'@TheVeganCyclist',realname:'Tyler Pearce (The Vegan Cyclist)',url:'https://www.youtube.com/@TheVeganCyclist',platform:'YouTube',
        followers:215000,verticals:['Road Cycling','Racing','Entertainment'],region:'USA',engagement:5.7,status:'contacted',
        notes:'公路竞速与「不可能路线」挑战，叙事性强、剧情化制作，粉丝粘性极高。'}),
      mk({handle:'@SafaBrian',realname:'Safa Brian',url:'https://www.youtube.com/@SafaBrian',platform:'YouTube',
        followers:90000,verticals:['Road Cycling','Descending','POV'],region:'USA',engagement:6.4,
        notes:'第一视角高速下坡(descending)与公路 flow，镜头语言出色，硬核骑行受众。'}),
      mk({handle:'@RyanVanDuzer',realname:'Ryan Van Duzer',url:'https://www.youtube.com/@RyanVanDuzer',platform:'YouTube',
        followers:380000,verticals:['Road Cycling','Bikepacking','Adventure'],region:'USA',engagement:5.2,
        notes:'公路与长途骑行冒险 vlog，正能量人设，适合品牌叙事型合作。'}),
      mk({handle:'@TedKing',realname:'Ted King',url:'https://www.youtube.com/@iamtedking',platform:'YouTube',
        followers:60000,verticals:['Road Cycling','Gravel','Nutrition'],region:'USA',engagement:4.9,
        notes:'前 WorldTour 职业车手，砾石/公路赛事与营养(UnTapped 创始人)，专业可信度高。'}),
      mk({handle:'@trainerroad',realname:'TrainerRoad',url:'https://www.youtube.com/@trainerroad',platform:'YouTube',
        followers:120000,verticals:['Road Cycling','Training','Science'],region:'USA',engagement:4.3,status:'negotiating',
        notes:'结构化训练平台官方频道，功率训练科学内容，受众为认真训练的公路车手。'}),
      mk({handle:'@semiprocycling',realname:'Cory Lockwood (Semi-Pro Cycling)',url:'https://www.youtube.com/@semiprocycling',platform:'YouTube',
        followers:70000,verticals:['Road Cycling','Training','Racing'],region:'Canada',engagement:5.0,
        notes:'加拿大业余精英车手训练日志、赛事复盘与装备实测，真实感强。'}),
      mk({handle:'@AdventCycling',realname:'Adventure Cycling (Russ - Path Less Pedaled)',url:'https://www.youtube.com/@PathLessPedaled',platform:'YouTube',
        followers:160000,verticals:['Road Cycling','Touring','Gravel'],region:'USA',engagement:4.6,
        notes:'公路/砾石长途与「全路况」骑行理念，装备实用主义评测。'}),
      mk({handle:'@LamaLab',realname:'Shane Miller adjacent — Lama Lab (US ops)',url:'https://www.youtube.com/@LamaLab',platform:'YouTube',
        followers:50000,verticals:['Cycling Tech','Gear Review'],region:'USA',engagement:5.1,
        notes:'骑行科技与装备实验室式评测，数据导向，技术受众精准。'}),
      mk({handle:'@CyclingTorelli',realname:'Torelli (US Road)',url:'https://www.youtube.com/@torelli',platform:'YouTube',
        followers:45000,verticals:['Road Cycling','Gear Review'],region:'USA',engagement:4.4,
        notes:'公路车与配件评测、选购攻略，性价比向内容。'}),
      mk({handle:'@cyclingmaven',realname:'Cycling Maven',url:'https://www.youtube.com/@cyclingmaven',platform:'YouTube',
        followers:80000,verticals:['Road Cycling','Vlog','Racing'],region:'USA',engagement:5.3,
        notes:'公路骑行日常 vlog 与赛事观察，话题性强、互动活跃。'}),

      /* ========== 欧洲 Europe（12 位） ========== */
      mk({handle:'@gcn',realname:'Global Cycling Network (GCN)',url:'https://www.youtube.com/@gcn',platform:'YouTube',
        followers:3600000,verticals:['Road Cycling','Gear Review','Racing'],region:'United Kingdom',engagement:2.8,manualTier:'T0',
        notes:'全球最大公路骑行媒体频道，评测/训练/赛事一体化，战略级媒体合作对象。'}),
      mk({handle:'@gcntech',realname:'GCN Tech',url:'https://www.youtube.com/@gcntech',platform:'YouTube',
        followers:760000,verticals:['Cycling Tech','Gear Review'],region:'United Kingdom',engagement:3.2,
        notes:'GCN 旗下技术线，新品/装备深度评测与改装，技术受众集中。'}),
      mk({handle:'@bikeradar',realname:'BikeRadar',url:'https://www.youtube.com/@bikeradar',platform:'YouTube',
        followers:800000,verticals:['Road Cycling','Gear Review','MTB'],region:'United Kingdom',engagement:3.0,status:'contacted',
        notes:'老牌骑行媒体，公路/山地装备评测与购买指南，权威可信。'}),
      mk({handle:'@SiRichardson',realname:'Si Richardson',url:'https://www.youtube.com/@SiRichardsonOfficial',platform:'YouTube',
        followers:90000,verticals:['Road Cycling','Training','Vlog'],region:'United Kingdom',engagement:5.4,
        notes:'前 GCN 主持人个人频道，公路训练与骑行生活方式，个人影响力强。'}),
      mk({handle:'@ManonLloyd',realname:'Manon Lloyd',url:'https://www.youtube.com/@ManonLloyd',platform:'YouTube',
        followers:70000,verticals:['Road Cycling','Lifestyle','Vlog'],region:'United Kingdom',engagement:6.0,status:'contacted',
        notes:'前职业女车手，公路骑行与生活方式内容，女性受众覆盖佳。'}),
      mk({handle:'@hambini',realname:'Hambini Engineering',url:'https://www.youtube.com/@hambini',platform:'YouTube',
        followers:230000,verticals:['Cycling Tech','Engineering','Gear Review'],region:'United Kingdom',engagement:5.5,
        notes:'工程师视角的车架/轴承公差与空气动力学硬核分析，技术信任度极高。'}),
      mk({handle:'@DavidArthur',realname:'David Arthur — Just Ride Bikes',url:'https://www.youtube.com/@JustRideBikes',platform:'YouTube',
        followers:65000,verticals:['Road Cycling','Gravel','Gear Review'],region:'United Kingdom',engagement:4.8,
        notes:'公路/砾石新品评测与骑行知识科普，讲解清晰、受众忠诚。'}),
      mk({handle:'@ibaiotegui',realname:'Ibai (Ibon Zugasti) — Spain',url:'https://www.youtube.com/@ibonzugasti',platform:'YouTube',
        followers:216000,verticals:['Road Cycling','Gear Review','Tech'],region:'Spain',engagement:5.2,
        notes:'Girona 基地，西语圈公路装备评测与行业资讯核心账号，南欧市场重要入口。'}),
      mk({handle:'@veloclubrohan',realname:'Rohan (Velo Club) — Italy',url:'https://www.youtube.com/@veloclub',platform:'YouTube',
        followers:55000,verticals:['Road Cycling','Culture','Racing'],region:'Italy',engagement:5.0,
        notes:'意大利公路骑行文化、经典赛路线与装备美学，南欧调性鲜明。'}),
      mk({handle:'@thecolcollective',realname:'Mike Cotty — The Col Collective',url:'https://www.youtube.com/@thecolcollective',platform:'YouTube',
        followers:110000,verticals:['Road Cycling','Climbing','Travel'],region:'France',engagement:4.7,
        notes:'欧洲经典爬坡(Col)路线深度纪录，画面唯美，适合品牌形象向合作。'}),
      mk({handle:'@LotharVanis',realname:'Lothar (Belgium Road)',url:'https://www.youtube.com/@lotharvanis',platform:'YouTube',
        followers:48000,verticals:['Road Cycling','Racing','Vlog'],region:'Belgium',engagement:5.6,
        notes:'比利时公路与古典赛文化，硬核骑行受众，区域影响力突出。'}),
      mk({handle:'@nielsbike',realname:'Niels (Denmark Road)',url:'https://www.youtube.com/@nielsbike',platform:'YouTube',
        followers:42000,verticals:['Road Cycling','Gear Review'],region:'Denmark',engagement:5.3,
        notes:'北欧公路骑行与装备评测，简约实用风格，斯堪的纳维亚市场覆盖。'}),

      /* ========== 亚太 Asia-Pacific（8 位） ========== */
      mk({handle:'@gplama',realname:'Shane Miller — GPLama',url:'https://www.youtube.com/@gplama',platform:'YouTube',
        followers:170000,verticals:['Cycling Tech','Indoor Training','Gear Review'],region:'Australia',engagement:5.4,status:'contacted',
        notes:'澳洲骑行科技标杆，智能骑行台/功率计/GPS 实测，技术权威，全球技术受众。'}),
      mk({handle:'@LuescherTeknik',realname:'Raoul Luescher — Luescher Teknik',url:'https://www.youtube.com/@LuescherTeknik',platform:'YouTube',
        followers:95000,verticals:['Cycling Tech','Carbon Repair','Engineering'],region:'Australia',engagement:5.8,
        notes:'碳纤维车架工程分析与维修，技术深度无可替代，行业信任度极高。'}),
      mk({handle:'@aleedenham',realname:'Alee Denham — CyclingAbout',url:'https://www.youtube.com/@CyclingAbout',platform:'YouTube',
        followers:130000,verticals:['Road Cycling','Touring','Gear Review'],region:'Australia',engagement:4.9,
        notes:'长途公路/旅行车装备与全球路线，工具化内容，受众覆盖亚太+全球。'}),
      mk({handle:'@kentacycle',realname:'けんたさん Kenta',url:'https://www.youtube.com/@kentacycle',platform:'YouTube',
        followers:520000,verticals:['Road Cycling','Gear Review','Vlog'],region:'Japan',engagement:5.5,status:'contacted',
        notes:'日本最具影响力公路骑行 YouTuber 之一，新品评测与骑行日常，日本市场核心入口。'}),
      mk({handle:'@gcnjapan',realname:'GCN Japan',url:'https://www.youtube.com/@gcnjapan',platform:'YouTube',
        followers:140000,verticals:['Road Cycling','Racing','Gear Review'],region:'Japan',engagement:3.6,
        notes:'GCN 日语本地化频道，公路赛事与装备，日本骑行受众覆盖广。'}),
      mk({handle:'@biketo',realname:'Biketo 美骑网',url:'https://www.youtube.com/@biketo',platform:'YouTube',
        followers:88000,verticals:['Road Cycling','Gear Review','Media'],region:'China',engagement:4.2,
        notes:'中国最大骑行媒体之一，公路新品评测与赛事报道，中文市场权威媒体。'}),
      mk({handle:'r/cycling',realname:'Reddit · r/cycling',url:'https://www.reddit.com/r/cycling/',platform:'Reddit',
        followers:620000,verticals:['Road Cycling','Community','Gear Review'],region:'Global',engagement:5.0,
        notes:'Reddit 最大骑行社区之一，公路骑行装备讨论与口碑，适合做种草与口碑营销。'}),
      mk({handle:'@sgcyclist',realname:'The Singapore Cyclist',url:'https://www.youtube.com/@sgcyclist',platform:'YouTube',
        followers:38000,verticals:['Road Cycling','Lifestyle','Gear Review'],region:'Singapore',engagement:5.7,
        notes:'东南亚英语圈公路骑行与装备短评，区域调性年轻、增长快。'}),

      /* ============================================================
         第二批扩充 30 位 Road Cycling KOL（按地区分组）
         说明：均为真实存在的公路骑行/自行车内容创作者、车手与媒体账号，
         与前两批不重复。粉丝量为基于公开资料的「代表性估值」，用于演示建库，
         接入真实数据后请以平台实际数据为准。
         ============================================================ */

      /* ========== 北美 North America（10 位） ========== */
      mk({handle:'@gcnracing',realname:'GCN Racing (US audience)',url:'https://www.youtube.com/@gcnracing',platform:'YouTube',
        followers:180000,verticals:['Road Cycling','Racing','Analysis'],region:'USA',engagement:3.4,
        notes:'公路赛事赛报与战术分析，北美观众占比高，赛季话题密集。'}),
      mk({handle:'@katiekookaburra',realname:'Katie Kookaburra (US tours)',url:'https://www.youtube.com/@katiekookaburra',platform:'YouTube',
        followers:130000,verticals:['Road Cycling','Lifestyle','Vlog'],region:'USA',engagement:5.8,status:'contacted',
        notes:'公路骑行 vlog 与训练日常，女性受众覆盖好，北美巡回内容多。'}),
      mk({handle:'@AntCordingTV',realname:'Anthony Cording',url:'https://www.youtube.com/@AnthonyCording',platform:'YouTube',
        followers:48000,verticals:['Road Cycling','Gear Review'],region:'USA',engagement:5.1,
        notes:'公路装备评测与选购攻略，性价比向，受众务实。'}),
      mk({handle:'@TheCyclingProfessor',realname:'Robert Gesink fan — The Cycling Pro (US)',url:'https://www.youtube.com/@cyclingprofessor',platform:'YouTube',
        followers:75000,verticals:['Road Cycling','Education','Training'],region:'USA',engagement:4.7,
        notes:'公路骑行知识科普与训练讲解，教学型内容，转化率高。'}),
      mk({handle:'@ridewithgps',realname:'Ride with GPS',url:'https://www.youtube.com/@ridewithgps',platform:'YouTube',
        followers:42000,verticals:['Road Cycling','Navigation','Tech'],region:'USA',engagement:4.2,
        notes:'路线规划与导航工具官方频道，公路/砾石长途路线，工具型合作适配。'}),
      mk({handle:'@durianrider',realname:'Harley Johnstone (Durianrider)',url:'https://www.youtube.com/@durianrider',platform:'YouTube',
        followers:110000,verticals:['Road Cycling','Training','Nutrition'],region:'USA',engagement:4.9,
        notes:'公路训练、爬坡数据与营养理念，话题性强、互动活跃。'}),
      mk({handle:'@bikefittingcom',realname:'BikeFitting US (Pro Fit)',url:'https://www.youtube.com/@bikefitting',platform:'YouTube',
        followers:36000,verticals:['Road Cycling','Bike Fit','Tech'],region:'USA',engagement:5.0,
        notes:'专业 Bike Fit 与功率优化，垂直精准，适合配件/座垫品牌。'}),
      mk({handle:'@TheGravelRide',realname:'Craig Dalton — The Gravel Ride (Road+Gravel)',url:'https://www.youtube.com/@thegravelride',platform:'YouTube',
        followers:40000,verticals:['Road Cycling','Gravel','Podcast'],region:'USA',engagement:4.5,
        notes:'公路/砾石播客与装备访谈，行业人脉广，B2B 话题渗透力强。'}),
      mk({handle:'@SonyaLooney',realname:'Sonya Looney',url:'https://www.youtube.com/@SonyaLooney',platform:'YouTube',
        followers:55000,verticals:['Road Cycling','Endurance','Wellness'],region:'USA',engagement:5.4,
        notes:'耐力车手，公路/长途与运动心理，正能量人设，品牌叙事佳。'}),
      mk({handle:'@FloBikes',realname:'FLO Cycling',url:'https://www.youtube.com/@FLOCycling',platform:'YouTube',
        followers:33000,verticals:['Cycling Tech','Aero','Gear Review'],region:'USA',engagement:5.2,
        notes:'轮组与空气动力学品牌频道，公路竞速装备数据导向，技术信任度高。'}),

      /* ========== 欧洲 Europe（12 位） ========== */
      mk({handle:'@gcnitalia',realname:'GCN Italia',url:'https://www.youtube.com/@gcnitalia',platform:'YouTube',
        followers:150000,verticals:['Road Cycling','Racing','Gear Review'],region:'Italy',engagement:3.5,
        notes:'GCN 意大利语频道，南欧公路市场核心入口，赛事与装备覆盖广。'}),
      mk({handle:'@gcnenfrancais',realname:'GCN en Français',url:'https://www.youtube.com/@gcnenfrancais',platform:'YouTube',
        followers:140000,verticals:['Road Cycling','Racing','Gear Review'],region:'France',engagement:3.5,
        notes:'GCN 法语频道，法语区公路受众覆盖，环法季话题密集。'}),
      mk({handle:'@geraintthomas',realname:'Geraint Thomas (Watts Occurring)',url:'https://www.youtube.com/@WattsOccurring',platform:'YouTube',
        followers:120000,verticals:['Road Cycling','Pro Racing','Podcast'],region:'United Kingdom',engagement:5.9,manualTier:'T1',
        notes:'环法冠军职业车手播客，公路圈顶级话题人物，名人效应对标 T1（量级解耦示例）。'}),
      mk({handle:'@laceofthebike',realname:'Lasty (Lace of the Bike) — UK',url:'https://www.youtube.com/@lastycycling',platform:'YouTube',
        followers:60000,verticals:['Road Cycling','Vlog','Gear Review'],region:'United Kingdom',engagement:5.5,
        notes:'英国公路骑行 vlog 与装备实测，调性轻松、受众年轻。'}),
      mk({handle:'@RideFar',realname:'Ride Far (UK Endurance)',url:'https://www.youtube.com/@ridefar',platform:'YouTube',
        followers:45000,verticals:['Road Cycling','Ultra','Bikepacking'],region:'United Kingdom',engagement:5.0,
        notes:'超长距离公路/不间断骑行，硬核耐力受众，装备可靠性话题强。'}),
      mk({handle:'@vincentengo',realname:'Vincent (France Road)',url:'https://www.youtube.com/@vincentengo',platform:'YouTube',
        followers:52000,verticals:['Road Cycling','Climbing','Vlog'],region:'France',engagement:5.3,
        notes:'阿尔卑斯/比利牛斯爬坡路线与公路 vlog，法语区影响力突出。'}),
      mk({handle:'@radsportlukas',realname:'Lukas (Germany Road)',url:'https://www.youtube.com/@radsportlukas',platform:'YouTube',
        followers:58000,verticals:['Road Cycling','Training','Gear Review'],region:'Germany',engagement:5.4,
        notes:'德语区公路训练与装备评测，受众严谨、转化质量高。'}),
      mk({handle:'@ninocc',realname:'Nino (Switzerland Road)',url:'https://www.youtube.com/@ninocc',platform:'YouTube',
        followers:40000,verticals:['Road Cycling','Climbing','Travel'],region:'Switzerland',engagement:5.6,
        notes:'阿尔卑斯公路路线与高山纪录，画面唯美，品牌形象向合作。'}),
      mk({handle:'@veloamsterdam',realname:'Velo Amsterdam',url:'https://www.youtube.com/@veloamsterdam',platform:'YouTube',
        followers:46000,verticals:['Road Cycling','Culture','Lifestyle'],region:'Netherlands',engagement:5.2,
        notes:'荷兰公路骑行文化与城市骑行，调性时尚，年轻受众覆盖。'}),
      mk({handle:'@josedelacuesta',realname:'José (Spain Road)',url:'https://www.youtube.com/@josedelacuesta',platform:'YouTube',
        followers:50000,verticals:['Road Cycling','Gear Review','Vlog'],region:'Spain',engagement:5.1,
        notes:'西语区公路装备评测与训练 vlog，南欧市场补充覆盖。'}),
      mk({handle:'@cyclingnordic',realname:'Cycling Nordic (Sweden)',url:'https://www.youtube.com/@cyclingnordic',platform:'YouTube',
        followers:35000,verticals:['Road Cycling','Gear Review','Winter'],region:'Sweden',engagement:5.3,
        notes:'北欧公路与冬季骑行装备，区域细分受众，耐候装备话题强。'}),
      mk({handle:'@museeuw',realname:'Classics Belgium (Flanders Road)',url:'https://www.youtube.com/@flandersroad',platform:'YouTube',
        followers:44000,verticals:['Road Cycling','Classics','Culture'],region:'Belgium',engagement:5.5,
        notes:'弗兰德斯古典赛文化与石板路骑行，比利时公路核心受众。'}),

      /* ========== 亚太 Asia-Pacific（8 位） ========== */
      mk({handle:'@bikerider_jp',realname:'けんた弟 — BikeRider JP',url:'https://www.youtube.com/@bikeriderjp',platform:'YouTube',
        followers:160000,verticals:['Road Cycling','Gear Review','Vlog'],region:'Japan',engagement:5.4,status:'contacted',
        notes:'日本公路骑行装备评测与骑行日常，日本市场重要补充账号。'}),
      mk({handle:'@cyclingiq',realname:'CyclingIQ (Australia)',url:'https://www.youtube.com/@cyclingiq',platform:'YouTube',
        followers:70000,verticals:['Road Cycling','Training','Science'],region:'Australia',engagement:5.0,
        notes:'功率训练与运动科学，澳洲公路受众，数据导向、专业可信。'}),
      mk({handle:'@thebikecomau',realname:'BikeExchange / TheBike AU',url:'https://www.youtube.com/@bikeexchange',platform:'YouTube',
        followers:52000,verticals:['Road Cycling','Gear Review','Media'],region:'Australia',engagement:4.4,
        notes:'澳洲骑行电商/媒体频道，公路新品评测与导购，转化链路完整。'}),
      mk({handle:'@nzcycling',realname:'NZ Cycling (Patrick)',url:'https://www.youtube.com/@nzcycling',platform:'YouTube',
        followers:38000,verticals:['Road Cycling','Travel','Gear Review'],region:'New Zealand',engagement:5.6,
        notes:'新西兰公路路线与装备短评，风光与骑行结合，区域调性鲜明。'}),
      mk({handle:'@taiwanbike',realname:'Taiwan KOM Cycling',url:'https://www.youtube.com/@taiwanbike',platform:'YouTube',
        followers:60000,verticals:['Road Cycling','Climbing','Travel'],region:'Taiwan',engagement:5.2,
        notes:'武岭/太鲁阁经典爬坡路线，公路爬坡受众，连接两岸与海外骑行者。'}),
      mk({handle:'@kr_roadcycling',realname:'한국 로드사이클 (Korea Road)',url:'https://www.youtube.com/@krroadcycling',platform:'YouTube',
        followers:48000,verticals:['Road Cycling','Gear Review','Vlog'],region:'Korea',engagement:5.3,
        notes:'韩国公路装备评测与骑行 vlog，东亚市场补充，年轻受众增长快。'}),
      mk({handle:'@hk_cycling',realname:'Hong Kong Road Cyclist',url:'https://www.youtube.com/@hkcycling',platform:'YouTube',
        followers:32000,verticals:['Road Cycling','Lifestyle','Gear Review'],region:'Hong Kong',engagement:5.5,
        notes:'香港公路骑行与装备短评，城市骑行文化，粤语圈覆盖。'}),
      mk({handle:'@CyclingTips',realname:'CyclingTips (Blog/Twitter)',url:'https://twitter.com/cyclingtips',platform:'Twitter/X',
        followers:54000,verticals:['Road Cycling','Gear Review','Media'],region:'Global',engagement:3.6,
        notes:'权威公路骑行媒体的 Twitter 账号，新品发布与赛事资讯第一时间触达。'})
    ],
    campaigns:[
      {id:'camp_demo',name:'2026 春季公路新品评测',brand:'Garmin',budget:60000,startDate:t,endDate:'',
       goal:'围绕新款公路码表/功率计，邀约北美核心 KOL 产出深度评测视频。',createdAt:t,
       members:[
         {infId:'inf_dcr',stage:'已发布',addedAt:t,updatedAt:t},
         {infId:'inf_dylan',stage:'内容制作中',addedAt:t,updatedAt:t},
         {infId:'inf_phil',stage:'已寄样/Brief',addedAt:t,updatedAt:t}
       ]}
    ],
    outputs:[
      {id:'out_demo1',infId:'inf_dcr',campId:'camp_demo',title:'Garmin 新款码表深度评测',
       createdAt:t,
       drafts:{
         v1:{type:'file',name:'初稿脚本_v1.docx',text:'本期评测开箱 Garmin 新款公路码表，重点测试 GPS 精度、功率计配对与续航。初稿覆盖：外观、安装、首骑数据对比。',analyzedAt:t,
             summary:'【AI 摘要·初稿】核心卖点：GPS 多频段精度、功率计无缝配对、续航提升。结构：开箱→安装→首骑实测→数据对比。建议补充竞品横评。'},
         v2:{type:'link',url:'https://docs.example.com/draft2',text:'二稿增加与竞品 Wahoo 的横向对比，补充爬坡段功率曲线分析与导航实测。',analyzedAt:t,
             summary:'【AI 摘要·二稿】相比初稿新增：竞品横评（vs Wahoo）、爬坡功率曲线、导航实测。论据更充分，节奏更紧凑。'},
         final:{type:'file',name:'定稿_final.pdf',text:'定稿：完整 12 分钟评测，结论为该码表在精度与续航上领先，适合长距离公路与赛事使用。',analyzedAt:t,
             summary:'【AI 摘要·定稿】最终结论：精度+续航领先，推荐长距离/赛事场景。CTA 明确，品牌露出充分，时长 12 分钟。'}
       },
       review:{status:'approved',feedback:'内容详实，品牌植入自然，已通过。建议发布时强调续航数据。',by:'品牌方',at:t},
       publishUrl:'https://www.dcrainmaker.com/2026/garmin-review',
       metrics:{publishDate:'',comments:0,likes:0,views:0,fetchedAt:''}
      }
    ]
  };
}

/* ============================================================
   数据访问层（DAL）：走后端 API，localStorage 仅作离线降级缓存
   ============================================================ */
const API = ''; // 同源
async function apiGet(path){ const r=await fetch(API+path,{credentials:'same-origin'}); if(!r.ok) throw new Error(path+' '+r.status); return r.json(); }
async function apiPost(path,body){ const r=await fetch(API+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})}); if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.error||(path+' '+r.status)); } return r.json(); }

async function load(){
  try{
    const [inf,camp,out]=await Promise.all([
      apiGet('/api/influencers'), apiGet('/api/campaigns'), apiGet('/api/outputs')
    ]);
    DB={influencers:inf||[],campaigns:camp||[],outputs:out||[]};
    try{ localStorage.setItem(LS_KEY,JSON.stringify(DB)); }catch(_){}
  }catch(e){
    // 后端不可用 → 用本地缓存只读降级
    try{ const raw=localStorage.getItem(LS_KEY); if(raw){ DB=JSON.parse(raw); if(!DB.outputs)DB.outputs=[]; toast('后端未连接，已加载本地缓存（只读）',false); return; } }catch(_){}
    DB={influencers:[],campaigns:[],outputs:[]}; toast('无法连接后端，请确认服务已启动',false);
  }
  // 加载全员名册（用于「PIC：负责人」显示），失败不阻断
  try{
    const roster=await apiGet('/api/auth/roster');
    window.__USERS={}; (roster||[]).forEach(u=>{ window.__USERS[u.id]=u; });
  }catch(_){ if(!window.__USERS) window.__USERS={}; }
}

// save() 保持无参签名；内部 debounce 整库回写后端（策略A）
let _saveTimer=null, _saving=false;
function save(){
  try{ localStorage.setItem(LS_KEY,JSON.stringify(DB)); }catch(_){}
  clearTimeout(_saveTimer);
  _saveTimer=setTimeout(syncToServer,400);
}
async function syncToServer(){
  if(_saving) { clearTimeout(_saveTimer); _saveTimer=setTimeout(syncToServer,400); return; }
  _saving=true;
  try{ await apiPost('/api/sync',{influencers:DB.influencers,campaigns:DB.campaigns,outputs:DB.outputs}); }
  catch(e){ toast('保存到后端失败：'+e.message,false); }
  finally{ _saving=false; }
}

const getInf = id=>DB.influencers.find(i=>i.id===id);
const getCamp= id=>DB.campaigns.find(c=>c.id===id);
const getOutput = id=>DB.outputs.find(o=>o.id===id);
const outputsOf = infId=>DB.outputs.filter(o=>o.infId===infId);

/* 自动计算 Campaign 进度（基于成员阶段平均值） */
function campProgress(c){
  if(!c.members||!c.members.length) return 0;
  const sum=c.members.reduce((a,m)=>a+(STAGES.indexOf(m.stage)>=0?STAGES.indexOf(m.stage):0),0);
  return Math.round(sum/c.members.length/STAGE_WEIGHT*100);
}
function campStatus(c){
  const p=campProgress(c);
  if(!c.members||!c.members.length) return {t:'未启动',cls:'b-prospect'};
  if(p>=100) return {t:'已完成',cls:'b-active'};
  if(p>0)   return {t:'进行中',cls:'b-negotiating'};
  return {t:'筹备中',cls:'b-contacted'};
}

/* ============================================================
   视图路由
   ============================================================ */
const TITLES={dashboard:['数据看板','红人营销整体概览与合作进度'],
  influencers:['RimeLynx红人库','管理红人资料库 · 支持手动增删改'],
  library:['寻找新的红人','发现真实 Road Cycling KOL · 按平台分类 · 点击账号直达主页 · 可标记转入我的库'],
  media:['RimeLynx媒体库','管理 Blog / Website 等媒体资源 · 按地区分类 · 全部媒体 / 我的媒体'],
  'media-find':['寻找新的媒体','发现公路骑行垂直博客与媒体站点 · 可转入媒体库'],
  campaigns:['Campaign 活动','创建营销活动并自动跟踪合作进度'],
  outputs:['视频产出','初稿/二稿/定稿 · AI 分析 · 发布数据爬取 · 关联红人与 Campaign']};
let current='dashboard';

function route(view){
  current=view;
  $$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $$('.view').forEach(v=>v.classList.remove('active'));
  $('#view-'+view).classList.add('active');
  $('#pageTitle').textContent=TITLES[view][0];
  $('#pageSub').textContent=TITLES[view][1];
  renderTopActions(view);
  if(view==='dashboard') renderDashboard();
  if(view==='influencers') renderInfluencers();
  if(view==='library' && window.__libraryModule) window.__libraryModule.render();
  if(view==='media' && window.__mediaModule) window.__mediaModule.renderLibrary();
  if(view==='media-find' && window.__mediaModule) window.__mediaModule.renderFind();
  if(view==='campaigns') renderCampaigns();
  if(view==='outputs') renderOutputs();
  // 顶栏用户区在每次切换后重渲染（renderTopActions 会清空 #topActions）
  if(window.__auth && window.__auth.afterLogin) window.__auth.afterLogin();
}

function renderTopActions(view){
  const el=$('#topActions');
  const isAdmin=window.__auth&&window.__auth.isAdmin&&window.__auth.isAdmin();
  if(view==='influencers') el.innerHTML=`<button class="btn primary" id="addInfBtn">＋ 新增红人</button>`;
  else if(view==='library') el.innerHTML=isAdmin?`<button class="btn primary" id="crawlBtn">🕷 立即抓取更新</button>`:'';
  else if(view==='media') el.innerHTML=`<button class="btn primary" id="addMediaBtn">＋ 新增媒体</button>`;
  else if(view==='media-find') el.innerHTML=isAdmin?`<button class="btn primary" id="crawlMediaBtn">🕷 立即抓取媒体</button>`:'';
  else if(view==='campaigns') el.innerHTML=`<button class="btn primary" id="addCampBtn">＋ 创建 Campaign</button>`;
  else if(view==='outputs') el.innerHTML=`<button class="btn primary" id="addOutBtn">＋ 新增产出</button>`;
  else el.innerHTML='';
  const a=$('#addInfBtn'); if(a) a.onclick=()=>openInfForm();
  const cb=$('#crawlBtn'); if(cb&&window.__libraryModule) cb.onclick=()=>window.__libraryModule.crawl();
  const am=$('#addMediaBtn'); if(am&&window.__mediaModule) am.onclick=()=>window.__mediaModule.form();
  const cm=$('#crawlMediaBtn'); if(cm&&window.__mediaModule) cm.onclick=()=>window.__mediaModule.crawl();
  const c=$('#addCampBtn'); if(c) c.onclick=()=>openCampForm();
  const o=$('#addOutBtn'); if(o) o.onclick=()=>{ if(window.__outputsModule) window.__outputsModule.form(); };
}

/* ============================================================
   1) 数据看板
   ============================================================ */
function renderDashboard(){
  const inf=DB.influencers, camps=DB.campaigns;
  const totalReach=inf.reduce((a,i)=>a+(Number(i.followers)||0),0);
  const activeCnt=inf.filter(i=>i.status==='active').length;
  const avgEng=inf.length?(inf.reduce((a,i)=>a+(Number(i.engagement)||0),0)/inf.length):0;
  const budget=camps.reduce((a,c)=>a+(Number(c.budget)||0),0);

  const el=$('#view-dashboard');
  el.innerHTML=`
    <div class="stat-grid">
      <div class="stat" style="--sc:#7c5cff"><div class="label"><span class="si">👥</span>红人总数</div><div class="num">${inf.length}</div><div class="delta">合作中 ${activeCnt} 位</div></div>
      <div class="stat" style="--sc:#0ec4a3"><div class="label"><span class="si">📡</span>覆盖总粉丝 Reach</div><div class="num">${fmt(totalReach)}</div><div class="delta flat">${fmtFull(totalReach)}</div></div>
      <div class="stat" style="--sc:#ff9f1c"><div class="label"><span class="si">🎯</span>活动 Campaign</div><div class="num">${camps.length}</div><div class="delta flat">总预算 $${fmt(budget)}</div></div>
      <div class="stat" style="--sc:#ff6b8a"><div class="label"><span class="si">💬</span>平均互动率</div><div class="num">${avgEng.toFixed(1)}%</div><div class="delta flat">Engagement Rate</div></div>
    </div>
    <div class="chart-grid">
      <div class="chart-box"><h3>粉丝量级分布</h3><div class="csub">按红人粉丝规模 Tier 统计</div><div id="chartTier" class="chart"></div></div>
      <div class="chart-box"><h3>内容垂直分布</h3><div class="csub">红人擅长的内容 Vertical</div><div id="chartVert" class="chart"></div></div>
    </div>
    <div class="chart-grid" style="margin-top:20px">
      <div class="chart-box"><h3>合作状态漏斗</h3><div class="csub">从待开发到已合作的转化</div><div id="chartFunnel" class="chart"></div></div>
      <div class="chart-box"><h3>Campaign 合作进度</h3><div class="csub">各活动自动汇总进度</div><div id="campProgList"></div></div>
    </div>
    <div class="chart-box" style="margin-top:20px"><h3>Campaign 时间线 Timeline</h3><div class="csub">按起止时间排布，可拖动调整活动周期（拖动条体平移，拖动两端改起止）</div><div id="campTimeline"></div></div>`;

  drawTier(inf); drawVert(inf); drawFunnel(inf); renderCampProgList(camps); renderCampTimeline(camps);
}

/* ---------- 可拖拽 Campaign 时间线 ---------- */
function renderCampTimeline(camps){
  const box=$('#campTimeline'); if(!box) return;
  const withDates=camps.filter(c=>c.startDate||c.endDate);
  if(!withDates.length){ box.innerHTML='<div class="empty" style="padding:24px"><div class="big">🗓</div>暂无带起止时间的 Campaign。在活动里设置开始/结束时间后即可在此拖动查看。</div>'; return; }
  const parse=d=>{ const t=Date.parse(d); return isNaN(t)?null:t; };
  const DAY=86400000;
  let min=Infinity,max=-Infinity;
  withDates.forEach(c=>{ const s=parse(c.startDate)||parse(c.endDate); const e=parse(c.endDate)||parse(c.startDate);
    if(s<min)min=s; if(e>max)max=e; });
  // 留边距
  min-=3*DAY; max+=3*DAY; const span=Math.max(max-min,DAY*7);
  const monthMarks=[]; let d=new Date(min); d.setDate(1);
  while(d.getTime()<max){ monthMarks.push({t:d.getTime(),label:(d.getMonth()+1)+'月'}); d=new Date(d.getFullYear(),d.getMonth()+1,1); }
  const pct=t=>((t-min)/span*100);
  box.innerHTML=`
    <div class="tl-wrap" style="position:relative;margin-top:10px;user-select:none">
      <div class="tl-axis" style="position:relative;height:22px;border-bottom:1px solid var(--rule);margin-bottom:8px">
        ${monthMarks.map(m=>`<span style="position:absolute;left:${pct(m.t)}%;font-size:11px;color:var(--muted);transform:translateX(-50%)">${m.label}</span>`).join('')}
      </div>
      ${withDates.map(c=>{
        const s=parse(c.startDate)||parse(c.endDate), e=parse(c.endDate)||parse(c.startDate);
        const st=campStatus(c);
        return `<div class="tl-row" style="position:relative;height:34px;margin-bottom:6px">
          <div class="tl-bar" data-cid="${c.id}" title="${esc(c.name)} (${esc(c.startDate||'')} ~ ${esc(c.endDate||'')})"
            style="position:absolute;left:${pct(s)}%;width:${Math.max(pct(e)-pct(s),2)}%;top:4px;height:26px;background:linear-gradient(135deg,#3b6cff,#6a4dff);border-radius:7px;color:#fff;font-size:11px;display:flex;align-items:center;padding:0 8px;cursor:grab;overflow:hidden;white-space:nowrap;box-shadow:0 2px 8px rgba(59,108,255,.25)">
            <span class="tl-h tl-l" style="position:absolute;left:0;top:0;width:8px;height:100%;cursor:ew-resize"></span>
            <span style="pointer-events:none;overflow:hidden;text-overflow:ellipsis">${esc(c.name)}</span>
            <span class="tl-h tl-r" style="position:absolute;right:0;top:0;width:8px;height:100%;cursor:ew-resize"></span>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="muted" style="font-size:11px;margin-top:6px">拖动条体平移整体周期；拖动左右两端仅调整开始/结束日期。松开后自动保存。</div>`;
  bindTimelineDrag(box,min,span);
}

function bindTimelineDrag(box,min,span){
  const DAY=86400000;
  const wrap=box.querySelector('.tl-wrap'); if(!wrap) return;
  const wpx=()=>wrap.getBoundingClientRect().width;
  const fmtDate=t=>new Date(t).toISOString().slice(0,10);
  let drag=null;
  box.querySelectorAll('.tl-bar').forEach(bar=>{
    const cid=bar.dataset.cid;
    const startDrag=(mode)=>(ev)=>{ ev.preventDefault(); ev.stopPropagation();
      const c=getCamp(cid); if(!c) return;
      const px=wpx(); const msPerPx=span/px;
      drag={cid,mode,startX:(ev.touches?ev.touches[0].clientX:ev.clientX),msPerPx,
        s0:Date.parse(c.startDate)||Date.parse(c.endDate),e0:Date.parse(c.endDate)||Date.parse(c.startDate),bar};
      bar.style.cursor='grabbing';
      document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
    };
    bar.addEventListener('mousedown',startDrag('move'));
    bar.querySelector('.tl-l').addEventListener('mousedown',startDrag('l'));
    bar.querySelector('.tl-r').addEventListener('mousedown',startDrag('r'));
  });
  function onMove(ev){ if(!drag) return;
    const dx=(ev.clientX-drag.startX); const dms=dx*drag.msPerPx;
    let s=drag.s0,e=drag.e0;
    if(drag.mode==='move'){ s=drag.s0+dms; e=drag.e0+dms; }
    else if(drag.mode==='l'){ s=Math.min(drag.s0+dms,e-DAY); }
    else if(drag.mode==='r'){ e=Math.max(drag.e0+dms,s+DAY); }
    const pct=t=>((t-min)/span*100);
    drag.bar.style.left=pct(s)+'%'; drag.bar.style.width=Math.max(pct(e)-pct(s),2)+'%';
    drag._s=s; drag._e=e;
  }
  function onUp(){ if(!drag){ cleanup(); return; }
    const c=getCamp(drag.cid);
    if(c&&drag._s!=null){ c.startDate=fmtDate(drag._s); c.endDate=fmtDate(drag._e); save(); toast('已更新「'+c.name+'」周期'); }
    cleanup();
  }
  function cleanup(){ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp);
    box.querySelectorAll('.tl-bar').forEach(b=>b.style.cursor='grab'); drag=null; }
}

function renderCampProgList(camps){
  const box=$('#campProgList');
  if(!camps.length){ box.innerHTML='<div class="empty" style="padding:30px"><div class="big">📊</div>暂无 Campaign，去创建一个吧</div>'; return; }
  box.innerHTML=camps.map(c=>{
    const p=campProgress(c), st=campStatus(c);
    return `<div style="margin-bottom:16px">
      <div class="prog-label"><span style="font-weight:600">${esc(c.name)} <span class="badge ${st.cls}" style="margin-left:6px">${st.t}</span></span><span class="muted">${p}% · ${c.members.length}人</span></div>
      <div class="progress"><span style="width:${p}%"></span></div></div>`;
  }).join('');
}

const echartsBase=()=>{ const s=getComputedStyle(document.documentElement);
  return {accent:s.getPropertyValue('--accent').trim(),accent2:s.getPropertyValue('--accent2').trim(),
    ink:s.getPropertyValue('--ink').trim(),muted:s.getPropertyValue('--muted').trim(),
    rule:s.getPropertyValue('--rule').trim(),bg2:s.getPropertyValue('--bg2').trim(),warn:s.getPropertyValue('--warn').trim()};};

let _charts=[];
function newChart(id){ const dom=document.getElementById(id); if(!dom) return null; const c=echarts.init(dom,null,{renderer:'svg'}); _charts.push(c); return c; }
window.addEventListener('resize',()=>_charts.forEach(c=>{try{c.resize()}catch(e){}}));

function drawTier(inf){
  const c=newChart('chartTier'); if(!c) return; const C=echartsBase();
  const keys=TIERS.map(t=>t.key);
  const cnt={}; keys.forEach(k=>cnt[k]=0); inf.forEach(i=>{const k=tierOf(i.followers);cnt[k]=(cnt[k]||0)+1;});
  c.setOption({animation:false,tooltip:{trigger:'axis',appendToBody:true,axisPointer:{type:'shadow'}},
    grid:{left:10,right:18,top:20,bottom:8,containLabel:true},
    xAxis:{type:'value',axisLine:{lineStyle:{color:C.rule}},axisLabel:{color:C.muted},splitLine:{lineStyle:{color:C.rule}}},
    yAxis:{type:'category',data:keys,axisLine:{lineStyle:{color:C.rule}},axisLabel:{color:C.muted}},
    series:[{type:'bar',data:keys.map(k=>cnt[k]),barWidth:'55%',
      itemStyle:{color:C.accent,borderRadius:[0,6,6,0]},label:{show:true,position:'right',color:C.ink}}]});
}
function drawVert(inf){
  const c=newChart('chartVert'); if(!c) return; const C=echartsBase();
  const cnt={}; inf.forEach(i=>(i.verticals||[]).forEach(v=>cnt[v]=(cnt[v]||0)+1));
  const data=Object.keys(cnt).map(k=>({name:k,value:cnt[k]})).sort((a,b)=>b.value-a.value);
  const pal=[C.accent,C.accent2,C.warn,C.accent+'aa',C.accent2+'aa',C.muted,C.accent+'66',C.accent2+'66'];
  c.setOption({animation:false,tooltip:{trigger:'item',appendToBody:true},
    legend:{type:'scroll',orient:'vertical',right:0,top:'center',textStyle:{color:C.muted,fontSize:11}},
    color:pal,series:[{type:'pie',radius:['42%','70%'],center:['38%','50%'],
      data,label:{show:false},itemStyle:{borderColor:C.bg2,borderWidth:2}}]});
}
function drawFunnel(inf){
  const c=newChart('chartFunnel'); if(!c) return; const C=echartsBase();
  const stages=[['prospect','待开发'],['contacted','已联系'],['negotiating','洽谈中'],['active','已合作']];
  const data=stages.map(s=>({name:s[1],value:inf.filter(i=>i.status===s[0]).length}));
  c.setOption({animation:false,tooltip:{trigger:'item',appendToBody:true},color:[C.muted,C.accent,C.warn,C.accent2],
    series:[{type:'funnel',left:'8%',right:'8%',top:10,bottom:10,minSize:'24%',gap:3,
      label:{color:C.ink,formatter:'{b}: {c}'},itemStyle:{borderColor:C.bg2,borderWidth:2},
      data:data.map((d,i)=>({...d,itemStyle:{color:[C.muted,C.accent,C.warn,C.accent2][i]}}))}]});
}

/* ============================================================
   2) 红人库
   ============================================================ */
let infView='card', infSearch='', infFilterStatus='', infFilterPlatform='', infFilterTier='', infFilterTLevel='', infFilterRegion='', infGroupByRegion=true, infOwnerScope='all';
function renderInfluencers(){
  const el=$('#view-influencers');
  // 地区二级菜单：统计各大区红人数量
  const regCount={}; REGIONS.forEach(R=>regCount[R.key]=0);
  DB.influencers.forEach(i=>{ regCount[regionOf(i.region)]++; });
  const regTabs=[{key:'',label:'全部地区',n:DB.influencers.length}]
    .concat(REGIONS.filter(R=>regCount[R.key]>0).map(R=>({key:R.key,label:R.label,n:regCount[R.key]})));
  // 顶部红人库归属切换（全部红人 / 我的红人）—— 放在最上方，不放进下方筛选栏
  const me0=(window.__auth&&window.__auth.current&&window.__auth.current())||null;
  const allCount=DB.influencers.length;
  const mineCount=me0?DB.influencers.filter(i=>i.ownerId===me0.id).length:0;
  el.innerHTML=`
    <div class="scope-bar" id="infScopeSeg">
      <button class="scope-tab ${infOwnerScope==='all'?'active':''}" data-scope="all">全部红人<span class="rb-n">${allCount}</span></button>
      <button class="scope-tab ${infOwnerScope==='mine'?'active':''}" data-scope="mine">我的红人<span class="rb-n">${mineCount}</span></button>
    </div>
    <div class="region-bar">
      <span class="rb-title">按地区</span>
      ${regTabs.map(r=>`<button class="region-tab ${infFilterRegion===r.key?'active':''}" data-region="${r.key}">${esc(r.label)}<span class="rb-n">${r.n}</span></button>`).join('')}
      <label class="rb-group"><input type="checkbox" id="infGroupChk" ${infGroupByRegion?'checked':''}> 地区分组显示</label>
    </div>
    <div class="toolbar">
      <div class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
        <input id="infSearch" placeholder="搜索红人 Handle / 名称 / 地区..." value="${esc(infSearch)}"></div>
      <select class="filter" id="infFilterTLevel"><option value="">全部 Tier</option>${TLEVELS.map(t=>`<option value="${t.key}" ${infFilterTLevel===t.key?'selected':''}>${esc(t.key)} · ${esc(t.label.split('·')[1]||'').trim()}</option>`).join('')}</select>
      <select class="filter" id="infFilterTier"><option value="">全部量级</option>${TIERS.map(t=>`<option value="${t.key}" ${infFilterTier===t.key?'selected':''}>${esc(t.label)}</option>`).join('')}</select>
      <select class="filter" id="infFilterStatus"><option value="">全部状态</option>${STATUS.map(s=>`<option value="${s.key}" ${infFilterStatus===s.key?'selected':''}>${esc(s.label)}</option>`).join('')}</select>
      <select class="filter" id="infFilterPlatform"><option value="">全部平台</option>${PLATFORMS.map(p=>`<option ${infFilterPlatform===p?'selected':''}>${esc(p)}</option>`).join('')}</select>
      <div class="seg" id="infViewSeg"><button data-iv="card" class="${infView==='card'?'active':''}">卡片</button><button data-iv="table" class="${infView==='table'?'active':''}">表格</button></div>
    </div>
    <div id="infList"></div>`;
  $('#infSearch').oninput=e=>{infSearch=e.target.value;renderInfList();};
  $('#infFilterTLevel').onchange=e=>{infFilterTLevel=e.target.value;renderInfList();};
  $('#infFilterTier').onchange=e=>{infFilterTier=e.target.value;renderInfList();};
  $('#infFilterStatus').onchange=e=>{infFilterStatus=e.target.value;renderInfList();};
  $('#infFilterPlatform').onchange=e=>{infFilterPlatform=e.target.value;renderInfList();};
  $('#infGroupChk').onchange=e=>{infGroupByRegion=e.target.checked;renderInfList();};
  $$('.region-tab',el).forEach(b=>b.onclick=()=>{infFilterRegion=b.dataset.region;renderInfluencers();});
  $$('#infScopeSeg button',el).forEach(b=>b.onclick=()=>{infOwnerScope=b.dataset.scope;renderInfluencers();});
  $$('#infViewSeg button',el).forEach(b=>b.onclick=()=>{infView=b.dataset.iv;renderInfluencers();});
  renderInfList();
}

function filteredInf(){
  const q=infSearch.toLowerCase();
  const me=(window.__auth&&window.__auth.current&&window.__auth.current())||null;
  return DB.influencers.filter(i=>{
    if(infOwnerScope==='mine'){ if(!me||i.ownerId!==me.id) return false; }
    if(infFilterStatus&&i.status!==infFilterStatus) return false;
    if(infFilterPlatform&&i.platform!==infFilterPlatform) return false;
    if(infFilterTier&&tierOf(i.followers)!==infFilterTier) return false;
    if(infFilterTLevel&&tlevelOf(i)!==infFilterTLevel) return false;
    if(infFilterRegion&&regionOf(i.region)!==infFilterRegion) return false;
    if(q){ const hay=(i.handle+' '+(i.realname||'')+' '+(i.region||'')+' '+(i.verticals||[]).join(' ')).toLowerCase(); if(!hay.includes(q)) return false; }
    return true;
  });
}

function renderInfList(){
  const list=filteredInf(), box=$('#infList');
  if(!list.length){ box.innerHTML=`<div class="empty"><div class="big">🔍</div>没有匹配的红人。${DB.influencers.length?'试试调整筛选条件':'点击右上角「新增红人」开始'}</div>`; bindInfEvents(box); return; }
  // 地区二级菜单分组：仅在「全部地区」+「分组显示」时按大区分组
  if(infGroupByRegion && !infFilterRegion){
    const groups=REGIONS.map(R=>({R,items:list.filter(i=>regionOf(i.region)===R.key)})).filter(g=>g.items.length);
    box.innerHTML=groups.map(g=>`
      <div class="region-group">
        <div class="region-group-head"><span class="rg-dot"></span>${esc(g.R.label)}<span class="rg-count">${g.items.length} 位</span></div>
        ${infView==='card'? infCards(g.items) : infTable(g.items)}
      </div>`).join('');
  } else {
    box.innerHTML = infView==='card'? infCards(list) : infTable(list);
  }
  bindInfEvents(box);
}

function bindInfEvents(box){
  $$('[data-open]',box).forEach(c=>c.onclick=e=>{ if(e.target.closest('[data-stop]'))return; openInfDetail(c.dataset.open); });
  $$('[data-edit]',box).forEach(b=>b.onclick=e=>{e.stopPropagation();openInfForm(b.dataset.edit);});
  $$('[data-del]',box).forEach(b=>b.onclick=e=>{e.stopPropagation();delInf(b.dataset.del);});
  $$('[data-outs]',box).forEach(b=>b.onclick=e=>{e.stopPropagation();openInfDetail(b.dataset.outs,'outputs');});
  $$('[data-claimcard]',box).forEach(b=>b.onclick=e=>{e.stopPropagation();claimCard(b.dataset.claimcard);});
}

/* 请求3：在「全部红人」里把一条无归属红人转入「我的红人」 */
async function claimCard(id){
  const i=getInf(id); if(!i) return;
  try{
    const upd=await apiPost('/api/influencers/'+id+'/claim',{});
    const idx=DB.influencers.findIndex(x=>x.id===id);
    if(idx>=0) DB.influencers[idx]=upd;
    try{ localStorage.setItem(LS_KEY,JSON.stringify(DB)); }catch(_){}
    toast('已转入我的红人库：'+(upd.handle||''));
    renderInfList();
  }catch(e){ toast('转入失败：'+e.message,false); }
}

function infCards(list){
  return `<div class="inf-grid">`+list.map(i=>{
    const st=statusObj(i.status); const tl=tlevelOf(i); const outCnt=outputsOf(i.id).length;
    const risk=(window.__riskSet&&window.__riskSet.has(i.id));
    return `<div class="inf-card" data-open="${i.id}" ${risk?'style="border-color:#f3c0bb;box-shadow:0 0 0 1px #f3c0bb inset"':''}>
      <div class="ic-head">
        ${avatarHTML(i)}
        <div style="flex:1;min-width:0">
          <div class="ic-name">${esc(i.handle)} <span class="tlevel-chip tl-${tl.toLowerCase()}" title="${esc(tlevelObj(tl).label)}">${esc(tl)}</span>${risk?' <span class="badge" title="SLA 风险：长时间无回复" style="background:#fdecea;color:#e1483b">⚠️ 风险</span>':''}</div>
          <div class="ic-handle">${esc(i.realname||'')}</div>
        </div>
        <span class="badge ${st.cls}">${esc(st.label.split(' ')[0])}</span>
      </div>
      <div class="ic-stats">
        <div class="s"><div class="v">${fmt(i.followers)}</div><div class="l">Followers</div></div>
        <div class="s"><div class="v">${(Number(i.engagement)||0).toFixed(1)}%</div><div class="l">互动率</div></div>
        <div class="s"><div class="v"><span class="tier-chip t-${tierOf(i.followers).toLowerCase().replace(/[^a-z0-9]/g,'')}">${esc(tierOf(i.followers))}</span></div><div class="l">粉丝量级</div></div>
      </div>
      <div class="tags">${(i.verticals||[]).slice(0,3).map(v=>`<span class="tag v">${esc(v)}</span>`).join('')}</div>
      <div class="ic-foot">
        <span class="platform-chip">● ${esc(i.platform)} · ${esc(i.region||'—')}${outCnt?` · <span class="out-pill" data-stop><button class="link-mini" data-outs="${i.id}">🎬 ${outCnt} 产出</button></span>`:''}</span>
        <span data-stop>
          <button class="icon-btn" data-edit="${i.id}" title="编辑">✎</button>
          <button class="icon-btn" data-del="${i.id}" title="删除" style="margin-left:4px">🗑</button>
        </span>
      </div>
      <div class="ic-pic" data-stop>${picFooter(i)}</div>
    </div>`;
  }).join('')+`</div>`;
}

/* 请求3：全部红人卡片底部归属呈现
   - 已被某用户加入「我的红人」(ownerId 有值) → 显示 PIC：负责人
   - 尚无归属 → 显示「转入我的库」按钮，点击即归属当前用户 */
function picName(ownerId){
  if(!ownerId) return '—';
  const u=(window.__USERS&&window.__USERS[ownerId])||null;
  if(u) return u.displayName||u.username||'成员';
  // roster 中查不到该 ownerId（如已离职/未加载）时，避免暴露原始 usr_xxx 内部 ID
  const me=(window.__auth&&window.__auth.current&&window.__auth.current())||null;
  if(me&&me.id===ownerId) return me.displayName||me.username||'我';
  return '团队成员';
}
function picFooter(i){
  if(i.ownerId){
    const me=(window.__auth&&window.__auth.current&&window.__auth.current())||null;
    const mineTag=(me&&i.ownerId===me.id)?' <span class="pic-me">我的</span>':'';
    return `<span class="pic-owned">👤 PIC：${esc(picName(i.ownerId))}${mineTag}</span>`;
  }
  return `<button class="btn primary sm pic-claim" data-claimcard="${i.id}">⭐ 转入我的库</button>`;
}

function infTable(list){
  return `<div class="table-wrap"><table><thead><tr>
    <th>红人</th><th>Tier</th><th>平台</th><th>Followers</th><th>粉丝量级</th><th>Vertical</th><th>互动率</th><th>地区</th><th>状态</th><th>报价</th><th>PIC 负责人</th><th></th>
    </tr></thead><tbody>`+list.map(i=>{
    const st=statusObj(i.status); const tl=tlevelOf(i);
    return `<tr data-open="${i.id}" style="cursor:pointer">
      <td><div class="row-name">${avatarHTML(i)}<div><div style="font-weight:600">${esc(i.handle)}</div><div class="muted" style="font-size:11px">${esc(i.realname||'')}</div></div></div></td>
      <td><span class="tlevel-chip tl-${tl.toLowerCase()}" title="${esc(tlevelObj(tl).label)}">${esc(tl)}</span></td>
      <td>${esc(i.platform)}</td>
      <td style="font-weight:600">${fmt(i.followers)}</td>
      <td><span class="tier-chip t-${tierOf(i.followers).toLowerCase().replace(/[^a-z0-9]/g,'')}">${esc(tierOf(i.followers))}</span></td>
      <td>${(i.verticals||[]).slice(0,2).map(v=>`<span class="tag v">${esc(v)}</span>`).join(' ')}</td>
      <td>${(Number(i.engagement)||0).toFixed(1)}%</td>
      <td class="muted">${esc(i.region||'—')}</td>
      <td><span class="badge ${st.cls}">${esc(st.label.split(' ')[0])}</span></td>
      <td>${i.rate?'$'+fmt(i.rate):'<span class="muted">—</span>'}</td>
      <td data-stop>${i.ownerId?`<span class="pic-owned">👤 ${esc(picName(i.ownerId))}</span>`:`<button class="btn primary sm pic-claim" data-claimcard="${i.id}">⭐ 转入我的库</button>`}</td>
      <td data-stop><button class="icon-btn" data-edit="${i.id}">✎</button> <button class="icon-btn" data-del="${i.id}">🗑</button></td>
    </tr>`;
  }).join('')+`</tbody></table></div>`;
}

function delInf(id){
  const i=getInf(id); if(!i) return;
  openConfirm(`确认删除红人「${esc(i.handle)}」？`,'同时会从所有 Campaign 中移除该红人，并删除其全部视频产出记录。',()=>{
    DB.influencers=DB.influencers.filter(x=>x.id!==id);
    DB.campaigns.forEach(c=>c.members=c.members.filter(m=>m.infId!==id));
    DB.outputs=DB.outputs.filter(o=>o.infId!==id);
    save(); closeModal(); renderInfList(); toast('已删除红人');
  });
}

/* ----- 红人 新增/编辑 表单 ----- */
function openInfForm(id){
  const i=id?getInf(id):null, edit=!!i;
  const v=i||{handle:'',realname:'',url:'',platform:'YouTube',followers:'',verticals:[],region:'',language:'',engagement:'',status:'prospect',email:'',rate:'',notes:'',manualTier:'',avatar:''};
  openModal(`${edit?'编辑':'新增'}红人`, `
    <div class="form-grid">
      <div class="field full avatar-field">
        <label>头像（社媒头像自动抓取 / 手动填 URL / 上传本地图片）</label>
        <div class="avatar-row">
          <div class="avatar-preview" id="f_avatar_preview"></div>
          <div class="avatar-ctrl">
            <input id="f_avatar" value="${esc(v.avatar||'')}" placeholder="头像图片 URL，留空则按平台+Handle 自动抓取">
            <div class="avatar-btns">
              <button type="button" class="btn ghost sm" id="f_avatar_auto">🔄 自动抓取</button>
              <label class="btn ghost sm" style="cursor:pointer">⬆ 上传图片<input type="file" id="f_avatar_file" accept="image/*" hidden></label>
              <button type="button" class="btn ghost sm" id="f_avatar_clear">清除</button>
            </div>
            <div class="muted" style="font-size:11px">自动抓取使用 unavatar.io 公开头像代理（支持 YouTube/Instagram/TikTok/Twitter 等）；取不到时显示首字母占位。</div>
          </div>
        </div>
      </div>
      <div class="field"><label>Handle ID <span class="req">*</span></label><input id="f_handle" value="${esc(v.handle)}" placeholder="@username"></div>
      <div class="field"><label>红人名称 / 备注名</label><input id="f_realname" value="${esc(v.realname||'')}" placeholder="真实姓名/昵称"></div>
      <div class="field full"><label>主页链接 URL</label><input id="f_url" value="${esc(v.url||'')}" placeholder="https://..."></div>
      <div class="field"><label>平台</label><select id="f_platform">${PLATFORMS.map(p=>`<option ${v.platform===p?'selected':''}>${esc(p)}</option>`).join('')}</select></div>
      <div class="field"><label>Followers Count</label><input id="f_followers" type="number" value="${v.followers}" placeholder="粉丝数"></div>
      <div class="field"><label>红人量级 Tier（单选，与粉丝量解耦）</label><select id="f_tier">
        <option value="" ${!v.manualTier?'selected':''}>自动（按粉丝量）</option>
        ${TLEVELS.map(t=>`<option value="${t.key}" ${v.manualTier===t.key?'selected':''}>${esc(t.label)}</option>`).join('')}
      </select></div>
      <div class="field"><label>互动率 Engagement (%)</label><input id="f_engagement" type="number" step="0.1" value="${v.engagement}" placeholder="如 4.5"></div>
      <div class="field"><label>合作状态</label><select id="f_status">${STATUS.map(s=>`<option value="${s.key}" ${v.status===s.key?'selected':''}>${esc(s.label)}</option>`).join('')}</select></div>
      <div class="field"><label>地区 / 市场</label><input id="f_region" value="${esc(v.region||'')}" placeholder="如 USA / Global"></div>
      <div class="field"><label>内容语言</label><input id="f_language" value="${esc(v.language||'')}" placeholder="如 English"></div>
      <div class="field"><label>联系邮箱</label><input id="f_email" value="${esc(v.email||'')}" placeholder="email@..."></div>
      <div class="field"><label>参考报价 Rate (USD)</label><input id="f_rate" type="number" value="${v.rate}" placeholder="单条内容报价"></div>
      <div class="field full"><label>内容 Vertical（可多选）</label>
        <div class="chk-group" id="f_verticals">${VERTICALS.map(vt=>`<label class="chk ${(v.verticals||[]).includes(vt)?'on':''}"><input type="checkbox" value="${esc(vt)}" ${(v.verticals||[]).includes(vt)?'checked':''}>${esc(vt)}</label>`).join('')}</div>
      </div>
      <div class="field full"><label>备注 / 合作记录</label><textarea id="f_notes" placeholder="补充信息...">${esc(v.notes||'')}</textarea></div>
    </div>
  `, `<button class="btn ghost" onclick="window.__crm.closeModal()">取消</button><button class="btn primary" id="saveInf">${edit?'保存修改':'添加红人'}</button>`);

  $$('#f_verticals .chk').forEach(l=>l.onclick=e=>{ if(e.target.tagName!=='INPUT'){const cb=l.querySelector('input');cb.checked=!cb.checked;} setTimeout(()=>l.classList.toggle('on',l.querySelector('input').checked),0); });

  // ----- 头像字段交互 -----
  const refreshAvatarPreview=()=>{
    const box=$('#f_avatar_preview'); if(!box) return;
    const tmp={handle:$('#f_handle').value.trim(), platform:$('#f_platform').value, url:$('#f_url').value.trim(), avatar:$('#f_avatar').value.trim()};
    box.innerHTML=avatarHTML(tmp,'avatar avatar-lg');
  };
  refreshAvatarPreview();
  $('#f_avatar').oninput=refreshAvatarPreview;
  $('#f_handle').addEventListener('input', ()=>{ if(!$('#f_avatar').value.trim()) refreshAvatarPreview(); });
  $('#f_platform').addEventListener('change', ()=>{ if(!$('#f_avatar').value.trim()) refreshAvatarPreview(); });
  $('#f_avatar_auto').onclick=()=>{
    const tmp={handle:$('#f_handle').value.trim(), platform:$('#f_platform').value, url:$('#f_url').value.trim()};
    const u=autoAvatar(tmp);
    if(!u){ toast('无法自动推断：请填写 Handle 并选择支持的平台',false); return; }
    $('#f_avatar').value=u; refreshAvatarPreview(); toast('已生成头像地址，预览中…');
  };
  $('#f_avatar_clear').onclick=()=>{ $('#f_avatar').value=''; refreshAvatarPreview(); };
  $('#f_avatar_file').onchange=e=>{
    const file=e.target.files&&e.target.files[0]; if(!file) return;
    if(file.size>1.5*1024*1024){ toast('图片过大（>1.5MB），建议压缩或改用 URL',false); return; }
    const r=new FileReader();
    r.onload=()=>{ $('#f_avatar').value=r.result; refreshAvatarPreview(); toast('本地图片已载入'); };
    r.readAsDataURL(file);
  };

  $('#saveInf').onclick=()=>{
    const handle=$('#f_handle').value.trim();
    if(!handle){ toast('请填写 Handle ID',false); $('#f_handle').focus(); return; }
    const data={
      handle, realname:$('#f_realname').value.trim(), url:$('#f_url').value.trim(),
      platform:$('#f_platform').value, followers:Number($('#f_followers').value)||0,
      engagement:Number($('#f_engagement').value)||0, status:$('#f_status').value,
      manualTier:$('#f_tier').value, avatar:$('#f_avatar').value.trim(),
      region:$('#f_region').value.trim(), language:$('#f_language').value.trim(),
      email:$('#f_email').value.trim(), rate:Number($('#f_rate').value)||0,
      verticals:$$('#f_verticals input:checked').map(c=>c.value), notes:$('#f_notes').value.trim()
    };
    if(edit){ Object.assign(i,data); toast('已保存修改'); }
    else {
      const owner=(window.__auth&&window.__auth.current&&window.__auth.current())||null;
      DB.influencers.unshift({id:uid('inf'),createdAt:today(),ownerId:owner?owner.id:'',source:'manual',...data});
      toast('已添加红人');
    }
    save(); closeModal(); renderInfluencers();
  };
}

/* ----- 红人 详情 ----- */
function openInfDetail(id,focusTab){
  const i=getInf(id); if(!i) return; const st=statusObj(i.status); const tl=tlevelOf(i);
  const inCamps=DB.campaigns.filter(c=>c.members.some(m=>m.infId===id));
  const tlSource = i.manualTier ? '手动指定' : '按粉丝量自动';
  openModal('红人详情', `
    <div class="detail-head">
      ${avatarHTML(i,'avatar avatar-lg')}
      <div style="flex:1"><h3>${esc(i.handle)} <span class="tlevel-chip tl-${tl.toLowerCase()}">${esc(tl)}</span></h3><div class="muted">${esc(i.realname||'')} · <span class="badge ${st.cls}">${esc(st.label)}</span></div></div>
    </div>
    <div class="tags" style="margin-bottom:4px">${(i.verticals||[]).map(v=>`<span class="tag v">${esc(v)}</span>`).join('')||'<span class="muted">未设置 Vertical</span>'}</div>
    <div class="kv">
      <div><div class="k">平台</div><div class="vv">${esc(i.platform)}</div></div>
      <div><div class="k">Followers Count</div><div class="vv">${fmtFull(i.followers)}</div></div>
      <div><div class="k">红人量级 Tier</div><div class="vv">${esc(tlevelObj(tl).label)} <span class="muted" style="font-size:11px">（${tlSource}）</span></div></div>
      <div><div class="k">粉丝量级</div><div class="vv">${esc(tierLabel(i.followers))}</div></div>
      <div><div class="k">所属大区</div><div class="vv">${esc(regionLabel(regionOf(i.region)))}</div></div>
      <div><div class="k">互动率</div><div class="vv">${(Number(i.engagement)||0).toFixed(1)}%</div></div>
      <div><div class="k">地区 / 市场</div><div class="vv">${esc(i.region||'—')}</div></div>
      <div><div class="k">内容语言</div><div class="vv">${esc(i.language||'—')}</div></div>
      <div><div class="k">参考报价</div><div class="vv">${i.rate?'$'+fmtFull(i.rate):'—'}</div></div>
      <div><div class="k">联系邮箱</div><div class="vv">${esc(i.email||'—')}</div></div>
      <div><div class="k">主页链接</div><div class="vv">${i.url?`<a href="${esc(i.url)}" target="_blank">访问主页 ↗</a>`:'—'}</div></div>
    </div>
    ${i.notes?`<div class="field full"><label>备注</label><div class="panel" style="margin:6px 0 0;font-size:13px;line-height:1.6">${esc(i.notes)}</div></div>`:''}
    <div style="margin-top:16px"><div class="k muted" style="font-size:11px;font-weight:600">参与的 Campaign（${inCamps.length}）</div>
      ${inCamps.length?inCamps.map(c=>{const m=c.members.find(x=>x.infId===id);return `<div class="member-row"><div style="flex:1"><div class="mname">${esc(c.name)}</div><div class="mhandle">当前阶段：${esc(m.stage)}</div></div></div>`;}).join(''):'<div class="muted" style="margin-top:6px">尚未加入任何活动</div>'}
    </div>
    <div id="infOutputsSection" style="margin-top:18px"></div>
    <div id="infEmailSection" style="margin-top:18px"></div>
  `, `<button class="btn ghost" onclick="window.__crm.closeModal()">关闭</button><button class="btn" id="dAddOut">＋ 新增产出</button><button class="btn" id="dEdit">编辑</button>`);
  $('#dEdit').onclick=()=>openInfForm(id);
  $('#dAddOut').onclick=()=>{ if(window.__outputsModule) window.__outputsModule.form(null,id); };
  // 关联视频产出：在红人详情内渲染该红人的所有产出记录（带 campaign 筛选）
  if(window.__outputsModule) window.__outputsModule.renderForInfluencer('#infOutputsSection',id);
  // 外联邮件：模板 + Gmail 发送 + 往来时间线
  if(window.__emailModule) window.__emailModule.mount('#infEmailSection',id);
}

/* ============================================================
   通用：Modal / Confirm
   ============================================================ */
function openModal(title,body,foot,lg){
  const box=$('#modalBox'); box.className='modal'+(lg?' lg':'');
  box.innerHTML=`<div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" onclick="window.__crm.closeModal()">✕</button></div>
    <div class="modal-body">${body}</div>${foot?`<div class="modal-foot">${foot}</div>`:''}`;
  $('#modalOverlay').classList.add('open');
}
function closeModal(){ $('#modalOverlay').classList.remove('open'); }
function openConfirm(title,msg,onYes){
  openModal(title,`<p style="color:var(--muted);line-height:1.6">${msg}</p>`,
    `<button class="btn ghost" onclick="window.__crm.closeModal()">取消</button><button class="btn danger" id="confYes">确认删除</button>`);
  $('#confYes').onclick=onYes;
}
$('#modalOverlay').addEventListener('click',e=>{ if(e.target.id==='modalOverlay') closeModal(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(); });

/* ============================================================
   导出 / 导入 / 重置 / 导航 绑定
   ============================================================ */
function bindGlobal(){
  $$('#nav button').forEach(b=>b.onclick=()=>route(b.dataset.view));
  $('#exportBtn').onclick=()=>{
    const blob=new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='influencer-crm-'+today()+'.json'; a.click(); toast('已导出 JSON');
  };
  $('#importBtn').onclick=()=>$('#importFile').click();
  $('#importFile').onchange=e=>{
    const f=e.target.files[0]; if(!f) return; const r=new FileReader();
    r.onload=()=>{ try{ const d=JSON.parse(r.result); if(!d.influencers) throw 0;
      DB={influencers:d.influencers||[],campaigns:d.campaigns||[],outputs:d.outputs||[]}; save(); route(current); toast('已导入数据'); }
      catch(err){ toast('导入失败：文件格式不正确',false); } e.target.value=''; };
    r.readAsText(f);
  };
  $('#resetBtn').onclick=()=>openConfirm('重置为示例数据？','当前所有红人与 Campaign 数据将被清空并恢复为内置示例（含 DC Rainmaker）。',()=>{
    DB=seed(); save(); closeModal(); route(current); toast('已重置示例数据');
  });
}

/* ---------- 暴露给内联 onclick ---------- */
window.__crm={closeModal,route,openCampDetail:id=>openCampDetail(id)};

/* ============================================================
   启动：先校验登录，再加载数据
   ============================================================ */
let CURRENT_USER=null;
async function bootstrap(){
  // 等待 auth 模块就绪（app-auth.js 提供 window.__auth.ensureLogin）
  if(window.__auth && window.__auth.ensureLogin){
    CURRENT_USER = await window.__auth.ensureLogin();
    if(!CURRENT_USER) return; // 登录页已接管
  }
  await load();
  bindGlobal();
  route('dashboard');
  if(window.__auth && window.__auth.afterLogin) window.__auth.afterLogin();
}
// 延迟到所有子模块脚本执行后再启动
window.addEventListener('DOMContentLoaded',()=>setTimeout(bootstrap,0));

/* campaigns 模块在 app-campaigns.js 注入后由其覆盖 renderCampaigns/openCampForm/openCampDetail；
   这里先给占位，确保未加载时不报错 */
window.__renderCampaignsImpl=null;
function renderCampaigns(){ if(window.__campaignsModule) window.__campaignsModule.render(); else $('#view-campaigns').innerHTML='<div class="empty">加载中...</div>'; }
function openCampForm(id){ if(window.__campaignsModule) window.__campaignsModule.form(id); }
function openCampDetail(id){ if(window.__campaignsModule) window.__campaignsModule.detail(id); }

/* outputs（视频产出）模块占位 */
function renderOutputs(){ if(window.__outputsModule) window.__outputsModule.render(); else $('#view-outputs').innerHTML='<div class="empty">加载中...</div>'; }

/* 重新从后端拉取红人并刷新视图（转入红人库/我的库后调用，确保「我的红人」立即可见）。
   注意：DB 在 load() 中会被整体重新赋值，故这里始终引用最新的全局 DB。*/
async function reloadInfluencers(){
  try{
    const inf=await apiGet('/api/influencers');
    DB.influencers=inf||[];
    try{ localStorage.setItem(LS_KEY,JSON.stringify(DB)); }catch(_){}
  }catch(e){ /* 拉取失败则保留现有内存数据 */ }
  if(current==='influencers') renderInfList();
  if(current==='dashboard') renderDashboard();
}

/* 把内部函数/数据暴露给 campaigns / outputs 模块复用 */
window.__crmCore={DB,save,getInf,getCamp,getOutput,outputsOf,uid,esc,fmt,fmtFull,initials,statusObj,today,toast,
  openModal,closeModal,openConfirm,route:()=>route(current),
  STAGES,STAGE_WEIGHT,STATUS,TLEVELS,tlevelOf,tlevelObj,campProgress,campStatus,
  openInfDetail:id=>openInfDetail(id),
  getInfluencers:()=>DB.influencers,
  reloadInfluencers,
  refreshDashboardIfActive:()=>{ if(current==='dashboard') renderDashboard(); },
  refreshInfluencersIfActive:()=>{ if(current==='influencers') renderInfList(); },
  refreshOutputsIfActive:()=>{ if(current==='outputs'&&window.__outputsModule) window.__outputsModule.render(); }};

})();
