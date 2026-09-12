async page => {
 await page.goto('http://localhost:1423/');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.setViewportSize({width:900,height:760});
 await page.evaluate(()=>{localStorage.setItem('i18nextLng','zh');localStorage.setItem('tauri-ui-theme','dark')});
 await page.goto('http://localhost:1423/?calendar=real&profile=long');
 await page.getByRole('button',{name:'账户',exact:true}).click();
 const buddy=page.locator('.harbor-calendar-companion');await buddy.waitFor();await buddy.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('.harbor-calendar-companion').dataset.phase==='idle');
 await page.locator('[data-contribution-day="2026-09-08"]').click();
 await page.waitForFunction(()=>document.querySelector('.harbor-calendar-companion').dataset.phase==='encounter');
 if(await buddy.getAttribute('data-encounter')!=='bug')throw Error('no bug encounter');
 await buddy.getByRole('button',{name:'暂停伙伴',exact:true}).click();
 await page.screenshot({path:'output/playwright/profile-companion/bug.png'});
 await buddy.getByRole('button',{name:'继续探索',exact:true}).click();
 // Test pausing in flight, not only pausing the encounter timer.
 await page.locator('[data-contribution-day]').first().click();
 await buddy.getByRole('button',{name:'暂停伙伴',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.harbor-calendar-companion').dataset.active==='false'&&document.querySelector('.harbor-companion-position').getAnimations().every(a=>a.playState==='paused'&&!a.pending));
 const x=await page.locator('.harbor-companion-position').evaluate(el=>el.getBoundingClientRect().left);
 await page.waitForTimeout(800);
 const pausedX=await page.locator('.harbor-companion-position').evaluate(el=>el.getBoundingClientRect().left);
 if(Math.abs(x-pausedX)>1)throw Error('travel did not pause '+JSON.stringify({x,pausedX}));
 await buddy.getByRole('button',{name:'继续探索',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.harbor-calendar-companion').dataset.phase==='idle');
 await page.getByRole('heading',{name:'Section 12',exact:true}).scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('.harbor-calendar-companion').dataset.active==='false');
 const offscreen=await buddy.getAttribute('data-active');
 await buddy.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.harbor-calendar-companion').dataset.active==='true');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
 await page.waitForFunction(()=>document.querySelector('.harbor-calendar-companion').dataset.active==='false');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))});
 await page.getByRole('button',{name:'月份',exact:true}).click();
 const date=page.locator('[data-contribution-day]').first();await date.focus();await page.keyboard.press('Enter');
 await page.getByRole('heading',{name:/Long profile name/}).click();
 if(await page.locator('[data-contribution-day][aria-pressed=true]').count())throw Error('outside click failed');
 await page.getByRole('button',{name:'月份',exact:true}).click();
 await buddy.scrollIntoViewIfNeeded();
 const colors=await page.locator('.harbor-contribution-cell').evaluateAll(cells=>cells.slice(0,10).map(el=>({bg:getComputedStyle(el).backgroundColor,fg:getComputedStyle(el).color})));
 for(const theme of ['light','dark'])for(const background of ['cool','neutral','bright']){
  await page.evaluate(theme=>localStorage.setItem('tauri-ui-theme',theme),theme);
  await page.goto(`http://localhost:1423/?calendar=real&background=${background}`);
  await page.getByRole('button',{name:'账户',exact:true}).click();await buddy.waitFor();await buddy.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('.harbor-calendar-companion').dataset.phase==='idle');
  await page.screenshot({path:`output/playwright/profile-companion/${theme}-${background}.png`});
 }
 return {bug:true,pausedTravel:{x,pausedX},offscreen,documentPause:true,outsideDismiss:true,colors};
}
