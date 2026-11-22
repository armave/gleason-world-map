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

test('renders all 12 requested distance multipliers at the same radii used by the map', async ({ page }) => {
  await openLoadedMap(page);

  const circles = page.locator('#visualRadialRows tr');
  await expect(circles).toHaveCount(12);
  const multipliers = await circles.locator('td:nth-child(2)').allTextContents();
  expect(multipliers).toEqual([
    '1.00×', '0.95×', '0.91×', '0.86×', '0.81×', '0.77×',
    '0.72×', '0.68×', '0.63×', '0.59×', '0.54×', '0.50×'
  ]);
  await expect(circles.first()).toContainText('0.0%');
  await expect(circles.last()).toContainText('100.0%');
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
  await expect(page.locator('#distanceSub')).toContainText('One ADS-B-calibrated flat-disk distance');
  await expect(page.locator('.secondary-distance-reading')).toHaveCount(0);
  await expect(page.locator('#flightDistanceValue')).toHaveCount(0);
  await expect(page.locator('#calibrationSupport')).toContainText('distance factor');
});

test('Santiago–Canberra uses the single calibrated distance near 11,400 km', async ({ page }) => {
  await openLoadedMap(page);

  await page.locator('#measureMode').click();
  await page.locator('#coordALat').fill('-33.45');
  await page.locator('#coordALon').fill('-70.67');
  await page.locator('#applyCoordsA').click();

  await page.locator('#coordBLat').fill('-35.27');
  await page.locator('#coordBLon').fill('149.13');
  await page.locator('#applyCoordsB').click();

  await expect(page.locator('#distanceValue')).toContainText('11,389.1');
  await expect(page.locator('#distanceSub')).toContainText('One ADS-B-calibrated flat-disk distance');
  await expect(page.locator('#calibrationSupport')).toContainText('distance factor 0.50×');
  await expect(page.locator('#calibrationRoutes')).toContainText('YPAD--YSSY');
  await expect(page.locator('#calibrationRoutes')).toContainText('YPAD--YPPH');
  await expect(page.locator('#flightDistanceValue')).toHaveCount(0);
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
  await expect(page.locator('#distanceSub')).toContainText('One ADS-B-calibrated flat-disk distance');
  await expect(page.locator('#calibrationSupport')).toContainText('near Antarctic rim');
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
  await expect(page.locator('#areaPerimeter')).toContainText('Planar perimeter');
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
  await expect(page.locator('#flightDistanceValue')).not.toHaveText('—');
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
