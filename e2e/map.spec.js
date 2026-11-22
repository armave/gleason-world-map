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

test('renders the 12 visual calibration circles as one smooth anchored radial profile', async ({ page }) => {
  await openLoadedMap(page);

  const circles = page.locator('#visualRadialRows tr');
  await expect(circles).toHaveCount(12);
  await expect(circles.first()).toContainText('1.00×');
  await expect(circles.first()).toContainText('0.0%');
  await expect(circles.last()).toContainText('0.50×');
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

test('shows coordinate-only great-circle distance and ADS-B estimate as separate references', async ({ page }) => {
  await openLoadedMap(page);

  await page.locator('#measureMode').click();
  await page.locator('#coordALat').fill('40.1792');
  await page.locator('#coordALon').fill('44.4991');
  await page.locator('#applyCoordsA').click();

  await expect(page.locator('#applyCoordsB')).toBeEnabled();
  await page.locator('#coordBLat').fill('51.5072');
  await page.locator('#coordBLon').fill('-0.1276');
  await page.locator('#applyCoordsB').click();

  await expect(page.locator('.primary-distance-reading')).toContainText('Great-circle A–B distance');
  await expect(page.locator('.primary-distance-reading')).toContainText('Spherical great-circle arc');
  await expect(page.locator('.primary-distance-reading')).toContainText('is display-only');
  await expect(page.locator('.secondary-distance-reading')).toContainText('ADS-B flight-mileage estimate');
  await expect(page.locator('#distanceValue')).not.toHaveText('—');
  await expect(page.locator('#flightDistanceValue')).not.toHaveText('—');
  await expect(page.locator('#calibrationRoutes')).toContainText('Nearest reference routes:');
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
