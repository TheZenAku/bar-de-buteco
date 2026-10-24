import {expect,test,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

type Body='male'|'female';
const output=path.resolve('test-results/avatar-v2');
const browserMessages:string[]=[];

async function openLab(page:Page){
  page.on('pageerror',error=>browserMessages.push(`pageerror: ${error.message}`));
  page.on('console',message=>{if(message.type()==='error')browserMessages.push(`console: ${message.text()}`);});
  await page.goto('/avatar-v2-lab.html');
  await page.waitForFunction(()=>document.body.dataset.labReady==='true',{timeout:90000});
  await expect(page.locator('#status')).toHaveText('ATIVO');
}

test.beforeAll(async()=>mkdir(output,{recursive:true}));

test('carrega ambos os corpos, um esqueleto e o contrato completo',async({page})=>{
  await openLab(page);
  const catalog=await page.evaluate(()=>window.avatarV2Lab!.catalogSummary());
  expect(catalog).toEqual({version:'2.0.0',bodies:2,pieces:31,regions:28,clips:18});
  for(const body of ['male','female'] as Body[]){
    const values=await page.evaluate(value=>window.avatarV2Lab!.setBody(value),body);
    expect(values).toHaveLength(1);expect(values[0].body).toBe(body);expect(values[0].armatureCount).toBe(1);expect(values[0].animComponents).toBe(1);expect(values[0].skinnedMeshInstances).toBeGreaterThan(4);expect(values[0].errors).toEqual([]);
  }
  await page.screenshot({path:path.join(output,'female-default.png'),fullPage:true});
});

test('monta todas as 31 peças e troca variantes em tempo real',async({page})=>{
  await openLab(page);
  const result=await page.evaluate(async()=>{
    const lab=window.avatarV2Lab!;const report:Array<{body:string;piece:string;armatures:number;errors:string[];materials:number}>=[];
    const pieceIds=['top_hoodie','top_jacket','top_shirt','top_tank','top_tee','top_tee_print','bottom_jeans','bottom_pants','bottom_shorts','bottom_skirt','footwear_boots','footwear_flipflops','footwear_shoes','footwear_sneakers','hair_bun','hair_buzzed','hair_long','hair_medium','hair_parted','hair_ponytail','hair_short','hair_wavy','facial_beard_full','facial_beard_short','facial_goatee','facial_mustache','accessory_bracelet','accessory_cap','accessory_glasses','accessory_hat','accessory_sunglasses'];
    for(const body of ['male','female'] as const){
      await lab.setBody(body);
      for(const piece of pieceIds){
        if(piece==='bottom_skirt'&&body==='male')continue;
        const slot=piece.startsWith('top_')?'top':piece.startsWith('bottom_')?'bottom':piece.startsWith('footwear_')?'footwear':piece.startsWith('hair_')?'hair':piece.startsWith('facial_')?'facialHair':'accessory';
        const clean={top:slot==='top'?[piece]:['top_tank'],bottom:slot==='bottom'?[piece]:['bottom_shorts'],footwear:slot==='footwear'?[piece]:['footwear_flipflops'],hair:slot==='hair'?[piece]:['hair_buzzed'],facialHair:slot==='facialHair'?[piece]:[],accessory:slot==='accessory'?[piece]:[]};
        const diag=await lab.setSelection({pieces:clean});
        report.push({body,piece,armatures:diag[0].armatureCount,errors:diag[0].errors,materials:diag[0].materialClones});
      }
    }
    return report;
  });
  expect(result).toHaveLength(61);
  expect(result.every(row=>row.armatures===1)).toBeTruthy();
  expect(result.every(row=>row.materials<=12)).toBeTruthy();
  expect(result.flatMap(row=>row.errors)).toEqual([]);
  await page.screenshot({path:path.join(output,'modular-last-piece.png'),fullPage:true});
});

test('aplica máscara, morphs, cores, animações e bloqueios do manifest',async({page})=>{
  await openLab(page);
  const mask=await page.evaluate(async()=>{
    const lab=window.avatarV2Lab!;await lab.setBody('female');
    let values=await lab.setSelection({facePreset:'redonda',brow:'thin',pieces:{top:['top_tank'],bottom:[],footwear:['footwear_sneakers'],hair:['hair_long'],facialHair:[],accessory:[]},colors:{...lab.selection.colors,skinTone:'#8b5138',eyeColor:'#2b73aa',hairColor:'#d2a845',topColor:'#29155f'}});
    const topOnly=values[0].hiddenRegions;values=await lab.setSlot('bottom',['bottom_skirt']);
    const full=values[0].hiddenRegions;return {topOnly,full};
  });
  expect(mask.topOnly).not.toContain('waist');expect(mask.full).toContain('waist');expect(mask.full).toContain('pelvis');
  await page.evaluate(()=>window.avatarV2Lab!.play('Sit'));await page.waitForTimeout(750);
  await page.screenshot({path:path.join(output,'female-skirt-sit.png'),fullPage:true});
  await page.getByRole('button',{name:'Perfil'}).click();await page.waitForTimeout(100);
  await page.screenshot({path:path.join(output,'female-skirt-sit-profile.png'),fullPage:true});
  await page.getByRole('button',{name:'Frente'}).click();
  const clips=['Idle','Walk','Run','Sit','Drink','Dance','Wave','Use','DrunkIdle','DrunkWalk','Fallen','Recover','Wait','CardsSit','AngrySit','Pose','OldCaneWalk','OldCaneHold'];
  for(const clip of clips){await page.evaluate(value=>window.avatarV2Lab!.play(value),clip);await page.waitForTimeout(60);const diag=await page.evaluate(()=>window.avatarV2Lab!.diagnostics()[0]);expect(diag.animation).toBe(clip);}
  const blocked=await page.evaluate(async()=>{const lab=window.avatarV2Lab!;await lab.setBody('male');await lab.setSlot('top',['top_hoodie']);try{await lab.setSlot('hair',['hair_wavy']);return '';}catch(error){return String(error);}});
  expect(blocked).toContain('bloqueada pelo manifest');
  await page.screenshot({path:path.join(output,'blocked-combination.png'),fullPage:true});
});

test('mede múltiplos avatares sem aprovar automaticamente',async({page})=>{
  await openLab(page);await page.evaluate(()=>window.avatarV2Lab!.setBody('male'));
  const measurements=[];
  for(const count of [1,4,8,16])measurements.push(await page.evaluate(value=>window.avatarV2Lab!.setCount(value),count));
  expect(measurements.map(value=>value.characters)).toEqual([1,4,8,16]);
  expect(measurements.every(value=>value.drawCalls>0&&value.fps>0)).toBeTruthy();
  await page.screenshot({path:path.join(output,'stress-16.png'),fullPage:true});
  const report=await page.evaluate(()=>window.avatarV2Lab!.captureReport());
  await writeFile(path.join(output,'runtime-report.json'),JSON.stringify({measurements,browserMessages,report},null,2));
});

test.afterAll(async()=>{
  await writeFile(path.join(output,'browser-errors.json'),JSON.stringify(browserMessages,null,2));
});
