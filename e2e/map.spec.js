import { test, expect } from '@playwright/test';

async function openLoadedMap(page, path = '/') {
  await page.goto(path);
  await expect(page.locator('#mapViewport')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#status')).toContainText('base map ready');
  await expect(page.locator('#map')).toBeVisible();
}

test('loads the map canvas and geographic reference data', async ({ page }) => {
  await openLoadedMap(page);

  const canvas = page.locator('#map');
  const dimensions = await canvas.evaluate(element => ({
    width: element.width,
    height: element.height,
    cssWidth: element.getBoundingClientRect().width,
    cssHeight: element.getBoundingClientRect().height
  }));

  expect(dimensions.width).toBeGreaterThan(0);
  expect(dimensions.height).toBeGreaterThan(0);
  expect(dimensions.cssWidth).toBeGreaterThan(400);
  expect(dimensions.cssHeight).toBeGreaterThan(280);
});

test('renders equal-spaced Gleason latitude rings from pole to Antarctic rim', async ({ page }) => {
  await openLoadedMap(page);

  const rings = page.locator('#radialRows tr');
  await expect(rings).toHaveCount(13);
  const latitudes = await rings.locator('td:nth-child(1)').allTextContents();
  expect(latitudes).toEqual([
    '90°N', '75°N', '60°N', '45°N', '30°N', '15°N', '0°',
    '15°S', '30°S', '45°S', '60°S', '75°S', '90°S'
  ]);

  const radii = (await rings.locator('td:nth-child(3)').allTextContents())
    .map(value => Number(value.replace(/[^0-9.]/g, '')));
  expect(radii[0]).toBe(0);
  expect(radii[6]).toBe(10000.8);
  expect(radii[12]).toBe(20001.6);
  for (let index = 1; index < radii.length; index++) {
    expect(radii[index] - radii[index - 1]).toBeCloseTo(1666.8, 1);
  }
});

test('zooms and rotates the map using the visible controls', async ({ page }) => {
  await openLoadedMap(page);

  await page.locator('#zoomIn').click();
  await expect(page.locator('#zoomReadout')).toHaveText('125%');

  await page.locator('#rotateRight').click();
  await expect(page.locator('#mapRotationValue')).toHaveText('15°');
});

test('searches for a capital and shows its geographic details', async ({ page }) => {
  await openLoadedMap(page);

  const search = page.locator('#search');
  await search.evaluate(element => { element.dataset.listenerProbe = 'attached'; });
  await search.fill('Yerevan');
  // State-store notifications must preserve the live control and its DOM listeners.
  await expect(search).toHaveAttribute('data-listener-probe', 'attached');
  const result = page.locator('#suggestions .suggestion').filter({ hasText: 'Yerevan' }).first();
  await expect(result).toBeVisible();
  await result.click();

  await expect(page.locator('#selectionName')).toHaveText('Yerevan');
  await expect(page.locator('#selectionKind')).toContainText('Capital of');
  await expect(page.locator('#selectionCoords')).not.toHaveText('—');
});

test('shows the single canonical distance for a route pair', async ({ page }) => {
  await openLoadedMap(page);

  await page.locator('#measureMode').click();
  await page.locator('#coordALat').fill('47.4489');
  await page.locator('#coordALon').fill('-122.3094');
  await page.locator('#applyCoordsA').click();

  await expect(page.locator('#applyCoordsB')).toBeEnabled();
  await page.locator('#coordBLat').fill('37.6213');
  await page.locator('#coordBLon').fill('-122.3790');
  await page.locator('#applyCoordsB').click();

  await expect(page.locator('.primary-distance-reading')).toContainText('Distance A–B');
  await expect(page.locator('#distanceValue')).not.toHaveText('—');
  await expect(page.locator('#distanceSub')).toContainText('Visible flat-disk chord');
  await expect(page.locator('.secondary-distance-reading')).toHaveCount(0);
  await expect(page.locator('#flightDistanceValue')).toHaveCount(0);
  await expect(page.locator('#routePointAName')).toContainText('manual coordinates');
  await expect(page.locator('#routePointBName')).toContainText('manual coordinates');
  await expect(page.locator('#routePointACoords')).not.toContainText('Waiting');
  await expect(page.locator('#routePointBCoords')).not.toContainText('Waiting');
  await expect(page.locator('#routeDistanceValue')).toHaveText(await page.locator('#distanceValue').textContent());
  await expect(page.locator('#routeRegisterStatus')).toContainText('same canonical measurement');
});

test('Santiago–Canberra uses the visible flat-disk chord metric', async ({ page }) => {
  await openLoadedMap(page);

  await page.locator('#measureMode').click();
  await page.locator('#coordALat').fill('-33.45');
  await page.locator('#coordALon').fill('-70.67');
  await page.locator('#applyCoordsA').click();

  await page.locator('#coordBLat').fill('-35.27');
  await page.locator('#coordBLon').fill('149.13');
  await page.locator('#applyCoordsB').click();

  await expect(page.locator('#distanceValue')).not.toHaveText('—');
  await expect(page.locator('#distanceSub')).toContainText('Visible flat-disk chord');
  await expect(page.locator('#flightDistanceValue')).toHaveCount(0);
});

test('moving a map measurement endpoint changes the visible chord distance', async ({ page }) => {
  await openLoadedMap(page);
  await page.locator('#measureMode').click();

  await page.locator('#coordALat').fill('18');
  await page.locator('#coordALon').fill('-70');
  await page.locator('#applyCoordsA').click();
  await page.locator('#coordBLat').fill('-48');
  await page.locator('#coordBLon').fill('-66');
  await page.locator('#applyCoordsB').click();

  const firstDistance = await page.locator('#distanceValue').textContent();
  await page.locator('#coordBLat').fill('65');
  await page.locator('#coordBLon').fill('-150');
  await page.locator('#applyCoordsB').click();
  const movedDistance = await page.locator('#distanceValue').textContent();

  expect(firstDistance).not.toBe('—');
  expect(movedDistance).not.toBe('—');
  expect(movedDistance).not.toBe(firstDistance);
  await expect(page.locator('#distanceSub')).toContainText('Visible flat-disk chord');
});


test('90°S coordinates remain distinct longitude-indexed points under the canonical metric', async ({ page }) => {
  await openLoadedMap(page);
  await page.locator('#measureMode').click();

  await page.locator('#coordALat').fill('-90');
  await page.locator('#coordALon').fill('0');
  await page.locator('#applyCoordsA').click();
  await page.locator('#coordBLat').fill('-90');
  await page.locator('#coordBLon').fill('180');
  await page.locator('#applyCoordsB').click();

  await expect(page.locator('#distanceValue')).not.toHaveText('—');
  await expect(page.locator('#distanceSub')).toContainText('Visible flat-disk chord');
  await expect(page.locator('.secondary-distance-reading')).toHaveCount(0);
  await expect(page.locator('#measureHelp')).toContainText('longitude-indexed Antarctic rim');
});

test('calculates a planar polygon area from three map clicks', async ({ page }) => {
  await openLoadedMap(page);
  await page.locator('#areaMode').click();

  const bounds = await page.locator('#map').boundingBox();
  expect(bounds).not.toBeNull();
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;

  await page.mouse.click(cx - 75, cy - 25);
  await page.mouse.click(cx + 80, cy - 15);
  await page.mouse.click(cx + 5, cy + 95);

  await expect(page.locator('#areaVertexCount')).toHaveText('3 vertices');
  await expect(page.locator('#finishArea')).toBeEnabled();
  await page.locator('#finishArea').click();

  await expect(page.locator('#areaValue')).not.toHaveText('—');
  await expect(page.locator('#areaValue')).not.toHaveText('Unavailable');
  await expect(page.locator('#areaPerimeter')).toContainText('Perimeter');
});

test('restores measurement endpoints and map orientation from a share URL', async ({ page }) => {
  await openLoadedMap(
    page,
    '/?r=30&a=40.1792,44.4991&b=51.5072,-0.1276&style=vintage'
  );

  await expect(page.locator('#mapRotationValue')).toHaveText('30°');
  await expect(page.locator('#endpointRows')).toContainText('Shared point A');
  await expect(page.locator('#endpointRows')).toContainText('Shared point B');
  await expect(page.locator('#distanceValue')).not.toHaveText('—');
});

test('opens the tools drawer on a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLoadedMap(page);

  const toggle = page.locator('#mobileToolsToggle');
  await expect(toggle).toBeVisible();
  await expect(page.locator('#toolsPanel')).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#toolsPanel')).toBeVisible();
});

test('exports the rendered map as a PNG download', async ({ page }) => {
  await openLoadedMap(page);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportPNG').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^gleason-world-map-\d{4}-\d{2}-\d{2}\.png$/);
});
