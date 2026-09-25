async page => {
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(()=>{localStorage.setItem('i18nextLng','zh');localStorage.setItem('tauri-ui-theme','dark')});
 await page.goto('http://localhost:1439/ui-components?view=opportunities&calendar=real');
 await page.getByRole('button',{name:'账户',exact:true}).click();
 await page.getByRole('button',{name:'月份',exact:true}).click();
 await page.getByRole('button',{name:'上个月',exact:true}).click();
 const dates=await page.locator('[data-contribution-day]').evaluateAll(es=>es.map(e=>({date:e.dataset.contributionDay,level:e.dataset.level})));
 const bug=dates.find(d=>d.level!=='0' && d.level!=='4' && Array.from(d.date).reduce((v,c)=>(v*31+c.charCodeAt(0))>>>0,0)%3===0);
 if(!bug) throw Error('Missing bug fixture');
 await page.evaluate(()=>{
   const el=document.querySelector('.harbor-calendar-companion');
   const observer=new MutationObserver(()=>{if(el.dataset.phase==='encounter'){Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));observer.disconnect();}});
   observer.observe(el,{attributes:true,attributeFilter:['data-phase']});
 });
 await page.locator(`[data-contribution-day="${bug.date}"] .harbor-contribution-top`).click();
 await page.mouse.move(5,5);
 await page.waitForFunction(()=>document.querySelector('.harbor-calendar-companion').dataset.active==='false');
 await page.waitForTimeout(400);
 const paused=await page.locator('.harbor-calendar-companion').getAttribute('data-phase');
 if(paused!=='encounter')throw Error('Encounter did not pause');
 await page.locator(`[data-contribution-day="${bug.date}"]`).evaluate(e=>e.scrollIntoView({block:'center'}));
 await page.screenshot({path:'output/playwright/calendar-3d/encounters-bug-paused.png'});
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});
 await page.waitForFunction(()=>document.querySelector('.harbor-calendar-companion').dataset.phase==='idle');
 const count=async()=>{
 await page.getByRole('button',{name:'像素伙伴设置',exact:true}).click();
 const n=await page.locator('[data-explored-count]').getAttribute('data-explored-count');
 await page.keyboard.press('Escape');return Number(n);
 };
 const first=await count();
 await page.locator(`[data-contribution-day="${bug.date}"] .harbor-contribution-top`).click();
 await page.waitForFunction(()=>document.querySelector('.harbor-calendar-companion').dataset.phase==='idle');
 const repeated=await count();if(first!==1||repeated!==1)throw Error('Repeated reward');
 const zero=dates.find(d=>d.level==='0');
 await page.locator(`[data-contribution-day="${zero.date}"] .harbor-contribution-top`).hover();
 if(await page.locator('[aria-pressed="true"][data-contribution-day]').getAttribute('data-contribution-day')!==bug.date)throw Error('Hover moved selection');
 await page.locator(`[data-contribution-day="${zero.date}"]`).focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('.harbor-calendar-companion').dataset.phase==='idle');
 const empty=await count();if(empty!==2)throw Error('Zero day not explored');
 return {bug:bug.date,backgroundPause:true,repeatCount:repeated,zeroCount:empty,hoverKeepsSelection:true};
}
