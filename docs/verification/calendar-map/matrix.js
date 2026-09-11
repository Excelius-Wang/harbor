async page => {
 const results=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:1423/');
 const c=()=>page.locator('.harbor-calendar-companion');
 const controls=()=>page.locator('.harbor-companion-controls');
 const phase=async value=>page.waitForFunction(v=>document.querySelector('.harbor-calendar-companion')?.dataset.phase===v,value);
 async function position(){return page.evaluate(()=>{
  const grid=document.querySelector('.harbor-contribution-map'), hero=document.querySelector('.harbor-companion-position');
  const cell=grid.querySelector('[aria-pressed="true"][data-contribution-day]');
  const h=hero.getBoundingClientRect(),d=cell.getBoundingClientRect(),g=grid.getBoundingClientRect();
  const expected=Math.max(g.left+h.width/2,Math.min(g.right-h.width/2,d.left+d.width/2));
  return {deltaX:Math.abs(h.left+h.width/2-expected),deltaY:Math.abs(parseFloat(hero.style.top)-(d.bottom-g.top)),pointer:getComputedStyle(hero.parentElement).pointerEvents};
 });}
 for(const lang of ['en','zh'])for(const theme of ['light','dark'])for(const width of [900,1440]){
  const key=`${lang}-${theme}-${width}`;
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width,height:1000});
  await page.evaluate(({lang,theme})=>{localStorage.setItem('i18nextLng',lang);localStorage.setItem('tauri-ui-theme',theme)},{lang,theme});
  await page.goto('http://localhost:1423/?calendar=real');
  await page.getByRole('button',{name:lang==='en'?'Account':'账户',exact:true}).click();
  await c().waitFor();await phase('idle');
  if(await page.locator('.harbor-companion-stage').count())throw Error('old stage');
  if(!await page.locator('.harbor-contribution-map > .harbor-calendar-companion').count())throw Error('not inside grid');
  await page.screenshot({path:`output/playwright/calendar-map/${key}-year.png`});
  const target=page.locator('[data-contribution-day][data-level="4"]').last();
  await target.click();await page.mouse.move(5,5);
  const immediate=await controls().getByRole('status').textContent();if(!immediate)throw Error('no date');
  await phase('encounter');
  const alignment=await position();if(alignment.deltaX>1||alignment.deltaY>1||alignment.pointer!=='none')throw Error(JSON.stringify(alignment));
  await page.getByRole('button',{name:lang==='en'?'Pixel companion settings':'像素伙伴设置',exact:true}).click();
  await page.getByRole('button',{name:lang==='en'?'Pause companion':'暂停伙伴',exact:true}).click();
  const pausedPhase=await c().getAttribute('data-phase');
  await page.waitForTimeout(950);if(await c().getAttribute('data-phase')!==pausedPhase)throw Error('pause');
  if(await target.getAttribute('aria-pressed')!=='true')throw Error('menu cleared selected date');
  if(await page.locator('progress').getAttribute('value')!=='74')throw Error('XP');
  await page.screenshot({path:`output/playwright/calendar-map/${key}-menu.png`});
  await page.getByRole('button',{name:lang==='en'?'Resume companion':'继续探索',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:lang==='en'?'Month':'月份',exact:true}).click();
  await page.getByRole('button',{name:lang==='en'?'Previous month':'上个月',exact:true}).click();
  const day=page.locator('[data-contribution-day]').first();await day.focus();await page.keyboard.press('Enter');await page.mouse.move(5,5);
  await phase('idle');
  if(await day.getAttribute('aria-pressed')!=='true')throw Error('keyboard');
  await page.getByRole('button',{name:lang==='en'?'Refresh':'刷新',exact:true}).focus();await page.keyboard.press('Enter');
  await page.waitForTimeout(650);
  await page.waitForFunction(()=>!document.querySelector('svg.animate-spin')&&Array.from(document.querySelectorAll('.harbor-contribution-cell')).every(e=>!e.getAnimations().some(a=>a.playState==='running')));
  if(await day.getAttribute('aria-pressed')!=='true')throw Error('refresh');
  await page.locator('.harbor-contribution-calendar').scrollIntoViewIfNeeded();
  await page.screenshot({path:`output/playwright/calendar-map/${key}-month.png`});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('overflow');
  const order=await page.evaluate(()=>Boolean(document.querySelector('.harbor-contribution-calendar').compareDocumentPosition(document.querySelector('.harbor-markdown'))&Node.DOCUMENT_POSITION_FOLLOWING));
  if(!order)throw Error('README order');
  results.push({key,alignment,keyboard:true,refresh:true,menuPause:true,order});
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.locator('[data-contribution-day]').last().click();
 await page.waitForFunction(()=>document.querySelector('.harbor-calendar-companion').dataset.active==='false');
 const reduced=await page.locator('.harbor-companion-hero').evaluate(e=>({animation:getComputedStyle(e).animationName,transform:getComputedStyle(e).transform}));
 if(reduced.animation!=='none'||reduced.transform!=='none')throw Error('motion');
 await page.screenshot({path:'output/playwright/calendar-map/reduced.png'});
 if(errors.length)throw Error(errors.join('\n'));
 return {results,reduced,errors};
}
