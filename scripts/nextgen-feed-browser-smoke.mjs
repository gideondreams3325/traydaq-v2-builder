import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

// Real Chromium viewport/gesture smoke using the exact GitHub-checked-out CSS.
// A layout smoke fixture cannot replace authenticated app/device E2E tests.
const css=await readFile('private-src/src/native-parity/next-gen-feed.css','utf8');
const sizes=[
  ['small Android phone',320,640],['Android portrait',360,760],
  ['large phone',430,932],['phone landscape',667,375],
  ['tablet portrait',768,1024],['tablet landscape',1024,768],
  ['desktop',1440,900]
];
const cards=Array.from({length:14},(_,i)=>
  '<article class="nd-post"><div class="nd-post-top"><strong>Creator '+(i+1)+'</strong></div>'+
  '<div class="nd-post-media"><div class="nd-photo-wrap"><button type="button"><img alt="Post photo"></button></div><div class="nd-media-watermark">TRAYDAQ ✦</div></div>'+
  '<div class="nd-post-bottom"><p class="nd-caption">Post '+(i+1)+'</p>'+
  '<div class="nd-actions"><button>Like</button><button>Comments</button><button>Share</button></div></div></article>'
).join('');
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}'+
  '.tdn-shell{width:100%;height:100%;--tdn-web-header-height:68px}.tdn-header{height:68px;background:#087747}'+
  '.tdn-main{width:100%;min-height:0}.tdn-page-slot{display:block}.nd-post-media{height:280px}'+
  '.nd-post-media .nd-photo-wrap{width:100%;height:100%}.nd-post-media .nd-photo-wrap>button{width:100%;height:100%;border:0;background:#123521}</style>'+
  '<style>'+css+'</style></head><body><div class="tdn-shell" data-active-page="feed">'+
  '<div class="tdn-header"></div><main class="tdn-main"><div class="tdn-page-slot" data-page="feed">'+
  '<main class="nd-feed" data-testid="nextgen-feed-web">'+
  '<header class="nd-head"><div class="nd-brand"><span class="nd-brand-orb">✦</span><div><small>TRAYDAQ</small><h1>Discover</h1></div></div>'+
  '<div class="nd-main-tabs"><button class="active">For You</button><button>Following</button></div>'+
  '<button class="nd-search-cta">Search</button></header><div class="nd-layout">'+
  '<aside class="nd-sidebar"><section class="nd-orbit"><h2>Discovery</h2><div class="nd-orbit-aura"><span class="nd-orbit-core"></span></div></section></aside>'+
  '<section class="nd-feed-main"><div class="nd-mobile-orbit"><section class="nd-orbit"><div class="nd-orbit-heading"><h2>Discover creators</h2><p>Discover your world</p></div>'+
  '<div class="nd-orbit-aura"><span class="nd-orbit-core"></span></div><div class="nd-orbit-actions"><button>Pick for You</button><button>Trending</button><button>Nearby</button></div></section></div>'+
  '<nav class="nd-mobile-tray"><button>Music</button><button>Products</button><button>Events</button><button>Jobs</button></nav>'+
  '<div class="nd-updates"><header><h2>Fresh updates</h2></header><div class="nd-updates-row">'+
  '<button>Creator one</button><button>Creator two</button><button>Creator three</button><button>Creator four</button></div></div>'+
  '<div class="nd-feed-list">'+cards+'</div></section></div></main></div></main></div></body></html>';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let passed=0;
try {
  for(const [name,width,height] of sizes){
    const context=await browser.newContext({viewport:{width,height},isMobile:width<1000,hasTouch:true,deviceScaleFactor:1});
    const page=await context.newPage();
    try {
      await page.setContent(html);
      const dims=await page.evaluate(()=>{
        const el=document.querySelector('.nd-feed');
        return {client:el.clientHeight,scroll:el.scrollHeight,overflow:getComputedStyle(el).overflowY,
          screen:document.documentElement.scrollWidth,width:window.innerWidth};
      });
      assert(dims.client>100,name+' viewport collapsed: '+JSON.stringify(dims));
      assert(dims.scroll>dims.client+500,name+' content cannot scroll: '+JSON.stringify(dims));
      assert(['auto','scroll'].includes(dims.overflow),name+' overflow style: '+JSON.stringify(dims));
      assert(dims.screen<=dims.width+2,name+' horizontal overflow: '+JSON.stringify(dims));
      const layout=await page.evaluate(()=>{
        const post=document.querySelector('.nd-post-media').getBoundingClientRect();
        const mark=document.querySelector('.nd-media-watermark').getBoundingClientRect();
        const orbit=document.querySelector('.nd-mobile-orbit .nd-orbit').getBoundingClientRect();
        return {postHeight:post.height,postWidth:post.width,markHeight:mark.height,markWidth:mark.width,orbitHeight:orbit.height};
      });
      assert(layout.markHeight>0&&layout.markHeight<layout.postHeight*.35,
        name+' watermark covers the photo vertically: '+JSON.stringify(layout));
      assert(layout.markWidth>0&&layout.markWidth<layout.postWidth*.75,
        name+' watermark covers the photo horizontally: '+JSON.stringify(layout));
      if(width<=900)assert(layout.orbitHeight>0&&layout.orbitHeight<150,
        name+' discovery header too tall: '+JSON.stringify(layout));

      const media=page.locator('.nd-post-media').first();
      await media.scrollIntoViewIfNeeded();
      const box=await media.boundingBox();
      assert(box,name+' post media did not render');
      const x=Math.max(20,Math.min(width-20,box.x+box.width/2));
      const y=Math.max(85,Math.min(height-25,box.y+Math.min(45,box.height/3)));
      const before=await page.locator('.nd-feed').evaluate(el=>el.scrollTop);
      await page.mouse.move(x,y);
      await page.mouse.wheel(0,340);
      await page.waitForTimeout(160);
      const after=await page.locator('.nd-feed').evaluate(el=>el.scrollTop);
      assert(after>before+25,name+' photo wheel did not scroll: '+JSON.stringify({before,after,x,y}));

      await page.locator('.nd-feed').evaluate(el=>el.scrollTop=160);
      await media.scrollIntoViewIfNeeded();
      const b=await media.boundingBox();
      const sx=Math.max(22,Math.min(width-22,b.x+b.width/2));
      const sy=Math.max(150,Math.min(height-40,b.y+Math.min(b.height/2,90)));
      const pre=await page.locator('.nd-feed').evaluate(el=>el.scrollTop);
      const cdp=await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy}]});
      for(let d=24;d<=144;d+=24){
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sx,y:sy-d}]});
        await page.waitForTimeout(12);
      }
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForTimeout(160);
      const post=await page.locator('.nd-feed').evaluate(el=>el.scrollTop);
      assert(post>pre+10,name+' photo touch swipe did not scroll: '+JSON.stringify({pre,post,sx,sy}));
      console.log('PASS',name,width+'x'+height,'feedHeight',dims.client,'wheelDelta',Math.round(after-before),'touchDelta',Math.round(post-pre));
      passed++;
    } finally {await context.close();}
  }
  console.log('Passed '+passed+'/'+sizes.length+' Chromium viewport and scroll gesture tests.');
} finally {await browser.close();}
