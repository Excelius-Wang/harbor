async page => {
 await page.goto('http://localhost:1423/');
 await page.evaluate(()=>localStorage.setItem('i18nextLng','zh'));
 const results=[];
 await page.setViewportSize({width:900,height:620});
 for(const state of ['no-readme','long','loading','error','stale','empty']) {
  const suffix=['no-readme','long'].includes(state)?`profile=${state}`:`state=${state}&commands=github_get_profile_readme`;
  await page.goto('http://localhost:1423/?'+suffix);
  await page.getByRole('button',{name:'账户',exact:true}).click();
  await page.getByRole('heading',{name:state==='long'?/Long profile name/: 'Harbor Preview',exact:state!=='long'}).waitFor();
  const readme=page.getByRole('region',{name:'个人介绍',exact:true});
  if(state==='long'){
   await page.getByRole('heading',{name:'Section 12',exact:true}).waitFor();
   await page.getByRole('heading',{name:'Section 12',exact:true}).scrollIntoViewIfNeeded();
   const clipping=await page.locator('.harbor-markdown').evaluate(el=>el.clientHeight<el.scrollHeight);
   if(clipping)throw Error('README clipped');
  } else if(state==='error'){
   await page.getByText('暂时无法读取个人介绍',{exact:true}).waitFor();
   await page.getByRole('button',{name:'重试',exact:true}).click();
  } else if(state==='stale') {
   await page.getByRole('heading',{name:"Hi, I'm harbor-preview"}).waitFor();
   await page.getByRole('button',{name:'刷新',exact:true}).click();
   await page.getByText('Preview request failed. Retry to check error feedback.',{exact:true}).waitFor();
   if(!await page.getByRole('heading',{name:"Hi, I'm harbor-preview"}).count())throw Error('lost cached README');
  } else if(state==='no-readme'||state==='empty') {
   await page.getByText('过去一年有 340 次贡献',{exact:true}).waitFor();
   await page.waitForFunction(()=>!document.querySelector('[data-slot=skeleton]'));
   if(await page.locator('.harbor-markdown').count())throw Error('missing README should be omitted');
  } else {
   await page.getByText('过去一年有 340 次贡献',{exact:true}).waitFor();
   if(!await page.locator('[data-slot=skeleton]').count())throw Error('missing README skeleton');
  }
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(state+' overflow');
  await page.screenshot({path:`output/playwright/profile-layout/state-${state}.png`});
  results.push({state,passed:true});
 }
 return results;
}
