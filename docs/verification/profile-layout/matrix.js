async page => {
 await page.goto('http://localhost:1423/');
 const results=[];
 for (const lang of ['en','zh']) for (const theme of ['light','dark']) for (const width of [900,1440]) {
  const key=`${lang}-${theme}-${width}`;
  await page.setViewportSize({width,height:width===900?620:1000});
  await page.evaluate(({lang,theme})=>{localStorage.setItem('i18nextLng',lang);localStorage.setItem('tauri-ui-theme',theme)},{lang,theme});
  await page.goto('http://localhost:1423/');
  await page.getByRole('button',{name:lang==='en'?'Account':'账户',exact:true}).click();
  await page.getByRole('heading',{name:"Hi, I'm harbor-preview"}).waitFor();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error(key+' overflow');
  await page.screenshot({path:`output/playwright/profile-layout/${key}.png`});
  const opener=page.getByRole('button',{name:lang==='en'?'3 followers':'3 关注者',exact:true});
  await opener.focus();await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  const followers=dialog.getByRole('tab',{name:lang==='en'?'followers':'关注者',exact:true});
  await followers.focus();await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>document.querySelector('[role=dialog] [role=tab]:last-child')?.getAttribute('aria-selected')==='true');
  await page.screenshot({path:`output/playwright/profile-layout/${key}-connections.png`});
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  if(!await opener.evaluate(el=>el===document.activeElement))throw Error(key+' focus return');
  const calendar=page.getByRole('group',{name:lang==='en'?'Contribution calendar for the past year':'过去一年的贡献日历'});
  const cells=page.locator('button[data-contribution-day]');
  await cells.first().focus();await page.keyboard.press('ArrowRight');
  if(!await cells.nth(7).evaluate(el=>el===document.activeElement))throw Error('calendar keyboard');
  await page.keyboard.press('Escape');
  await page.getByRole('heading',{name:lang==='en'?'Public activity':'公开动态',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:`output/playwright/profile-layout/${key}-activity.png`});
  results.push({key,overflow:false,connectionsKeyboard:true,focusReturn:true});
 }
 return results;
}
