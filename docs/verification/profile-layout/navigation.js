async page => {
 await page.setViewportSize({width:900,height:620});
 await page.goto('http://localhost:1423/?profile=long');
 await page.getByRole('button',{name:'账户',exact:true}).click();
 await page.getByRole('heading',{name:'Section 12',exact:true}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('[data-slot=skeleton]'));
 await page.screenshot({path:'output/playwright/profile-layout/long-identity.png'});
 await page.getByRole('button',{name:'3 关注者',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:/alex-morgan/}).waitFor();
 await page.screenshot({path:'output/playwright/profile-layout/connections-populated.png'});
 await dialog.getByRole('button',{name:/alex-morgan/}).click();
 await page.getByRole('heading',{name:"Hi, I'm alex-morgan",exact:true}).waitFor();
 if(await page.getByRole('heading',{name:"Hi, I'm harbor-preview",exact:true}).count())throw Error('previous README retained on switch');
 await page.getByRole('button',{name:'返回我的主页',exact:true}).click();
 await page.getByRole('heading',{name:"Hi, I'm harbor-preview",exact:true}).waitFor();
 await page.getByRole('heading',{name:'Section 12',exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:'output/playwright/profile-layout/long-complete.png'});
 return {differentUserReadme:true,backToOwnProfile:true,fullReadme:true};
}
