import {expect,type Page} from '@playwright/test';

export type MenuTab='Ações'|'Você'|'Galera'|'Ajustes'|'Guia';
/**
 * The pause menu (Esc, docs/sistemas/interface.md#menu-esc), opened by its button as a click would, so it opens with the
 * chat focused too. `tab` picks a section.
 */
export async function openMenu(page:Page,tab?:MenuTab):Promise<void> {
  if(!await page.locator('#pause-menu.pm-open').count())await page.evaluate(()=>document.querySelector<HTMLElement>('[data-action="menu"]')!.click());
  await expect(page.locator('#pause-menu.pm-open')).toBeVisible();
  if(tab)await page.locator('#pause-menu').getByRole('tab',{name:tab}).click();
}
/** A row of a section, chosen and done: a window opens, an action happens or a page of settings shows its controls. */
export async function menuItem(page:Page,tab:MenuTab,label:string|RegExp):Promise<void> {
  await openMenu(page,tab);
  await page.locator('#pause-menu .pm-item').filter({hasText:label}).first().click();
}
/** A click on the blur beside the frame closes it (Esc would first leave a page of settings). */
export async function closeMenu(page:Page):Promise<void> {
  await page.mouse.click(5,5);
  await expect(page.locator('#pause-menu')).toBeHidden();
}
