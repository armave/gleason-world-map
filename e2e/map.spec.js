import {test,expect} from '@playwright/test';

async function openLoadedMap(page,path='/'){
 await page.goto(path);
 await expect(page.locator('#mapViewport')).toHaveAttribute('aria-busy','false');
 await expect(page.locator('#status')).toContainText('Dual-disk base map ready');
 await expect(page.locator('#map')).toBeVisible();
}
test('loads the dual-disk canvas and geographic reference datasets',async({page})=>{
 await openLoadedMap(page);
 const size=await page.locator('#map').evaluate(canvas=>({
  width:canvas.width,height:canvas.height,cssWidth:canvas.getBoundingClientRect().width,
  cssHeight:canvas.getBoundingClientRect().height
 }));
 expect(size.width).toBeGreaterThan(0);expect(size.height).toBeGreaterThan(0);
 expect(size.cssWidth).toBeGreaterThan(400);expect(size.cssHeight).toBeGreaterThan(280);
});
test('geometry table shows mirrored latitude radii for the two disks',async({page})=>{
 await openLoadedMap(page);
 const rows=page.locator('#radialRows tr');
 await expect(rows).toHaveCount(13);
 const labels=await rows.locator('td:nth-child(1)').allTextContents();
 expect(labels).toEqual(['90°N','75°N','60°N','45°N','30°N','15°N','0°','15°S','30°S','45°S','60°S','75°S','90°S']);
 const radii=(await rows.locator('td:nth-child(3)').allTextContents()).map(v=>Number(v.replace(/[^0-9.]/g,'')));
 expect(radii[0]).toBe(0);expect(radii[6]).toBe(10000.8);expect(radii[12]).toBe(0);
});
test('zooms and rotates both disks',async({page})=>{
 await openLoadedMap(page);
 await page.locator('#zoomIn').click();
 await expect(page.locator('#zoomReadout')).toHaveText('125%');
 await page.locator('#rotateRight').click();
 await expect(page.locator('#mapRotationValue')).toHaveText('15°');
});
test('searches for a capital and selects its map coordinate',async({page})=>{
 await openLoadedMap(page);
 const search=page.locator('#search');
 await search.fill('Yerevan');
 const result=page.locator('#suggestions .suggestion').filter({hasText:'Yerevan'}).first();
 await expect(result).toBeVisible();await result.click();
 await expect(page.locator('#selectionName')).toHaveText('Yerevan');
 await expect(page.locator('#selectionKind')).toContainText('Capital of');
 await expect(page.locator('#selectionCoords')).not.toHaveText('—');
});
test('same-disk route uses one 2D chord and the Route Register repeats its value',async({page})=>{
 await openLoadedMap(page);
 await page.locator('#measureMode').click();
 await page.locator('#coordALat').fill('-33.45');await page.locator('#coordALon').fill('-70.67');
 await page.locator('#applyCoordsA').click();
 await page.locator('#coordBLat').fill('-35.27');await page.locator('#coordBLon').fill('149.13');
 await page.locator('#applyCoordsB').click();
 await expect(page.locator('#distanceValue')).not.toHaveText('—');
 await expect(page.locator('#distanceSub')).toContainText('Same-disk 2D Euclidean chord');
 await expect(page.locator('#routeDistanceValue')).toHaveText(await page.locator('#distanceValue').textContent());
});
test('cross-Equator route uses the optimized two-leg planar hinge',async({page})=>{
 await openLoadedMap(page);
 await page.locator('#measureMode').click();
 await page.locator('#coordALat').fill('38.89');await page.locator('#coordALon').fill('-77.05');
 await page.locator('#applyCoordsA').click();
 await page.locator('#coordBLat').fill('-35.27');await page.locator('#coordBLon').fill('149.13');
 await page.locator('#applyCoordsB').click();
 await expect(page.locator('#distanceValue')).not.toHaveText('—');
 await expect(page.locator('#distanceSub')).toContainText('Cross-Equator planar hinge');
 await expect(page.locator('#routeDistanceValue')).toHaveText(await page.locator('#distanceValue').textContent());
});
test('area mode builds a polygon and calculates its planar measurements',async({page})=>{
 await openLoadedMap(page);
 await page.locator('#areaMode').click();
 const bounds=await page.locator('#map').boundingBox();
 const cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2;
 await page.mouse.click(cx-75,cy-25);await page.mouse.click(cx+80,cy-15);await page.mouse.click(cx+5,cy+95);
 await expect(page.locator('#areaVertexCount')).toHaveText('3 vertices');
 await page.locator('#finishArea').click();
 await expect(page.locator('#areaValue')).not.toHaveText('—');
 await expect(page.locator('#areaValue')).not.toHaveText('Unavailable');
 await expect(page.locator('#areaPerimeter')).toContainText('Perimeter');
});
test('share link restores route endpoints and orientation',async({page})=>{
 await openLoadedMap(page,'/?r=30&a=40.1792,44.4991&b=51.5072,-0.1276&style=vintage');
 await expect(page.locator('#mapRotationValue')).toHaveText('30°');
 await expect(page.locator('#endpointRows')).toContainText('Shared point A');
 await expect(page.locator('#endpointRows')).toContainText('Shared point B');
 await expect(page.locator('#distanceValue')).not.toHaveText('—');
});
test('mobile tools drawer opens on a narrow viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await openLoadedMap(page);
 const toggle=page.locator('#mobileToolsToggle');
 await expect(toggle).toBeVisible();await expect(page.locator('#toolsPanel')).toBeHidden();
 await toggle.click();
 await expect(toggle).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('#toolsPanel')).toBeVisible();
});
test('exports the rendered dual-disk map as a PNG',async({page})=>{
 await openLoadedMap(page);
 const downloadPromise=page.waitForEvent('download');
 await page.locator('#exportPNG').click();
 const download=await downloadPromise;
 expect(download.suggestedFilename()).toMatch(/^dual-disk-world-map-\d{4}-\d{2}-\d{2}\.png$/);
});
