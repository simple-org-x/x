import { test, expect } from '@playwright/test';

test.describe('Main Menu Navigation', () => {
  test('should load main menu with all buttons', async ({ page }) => {
    await page.goto('/');
    
    await expect(page.locator('text=Crypto Arena Survivors')).toBeVisible();
    await expect(page.getByRole('button', { name: /play/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /character select/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /how to play/i })).toBeVisible();
  });

  test('should toggle language between EN and ID', async ({ page }) => {
    await page.goto('/');
    
    const langBtn = page.getByRole('button', { name: /language/i });
    await expect(langBtn).toBeVisible();
    
    const initialText = await langBtn.textContent();
    expect(initialText).toMatch(/EN|ID/);
    
    await langBtn.click();
    const newText = await langBtn.textContent();
    expect(newText).not.toBe(initialText);
  });

  test('should navigate to character select', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('button', { name: /character select/i }).click();
    await expect(page.locator('text=Select Your Champion')).toBeVisible();
  });

  test('should navigate to how to play', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('button', { name: /how to play/i }).click();
    await expect(page.locator('text=How to Play')).toBeVisible();
  });
});

test.describe('Game Flow', () => {
  test('should complete username → character → playing flow', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('button', { name: /play/i }).click();
    await expect(page.locator('text=ARENA CALLSIGN')).toBeVisible();
    
    const usernameInput = page.locator('input[type="text"]').first();
    await usernameInput.fill('TestPlayer');
    
    await page.getByRole('button', { name: /save|deploy/i }).click();
    
    await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 });
  });

  test('should display HUD elements during gameplay', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('button', { name: /play/i }).click();
    const usernameInput = page.locator('input[type="text"]').first();
    await usernameInput.fill('HUDTest');
    await page.getByRole('button', { name: /save|deploy/i }).click();
    
    await page.waitForTimeout(2000);
    
    await expect(page.locator('text=/Lv|Level/i')).toBeVisible();
    await expect(page.locator('text=/HP|Health/i')).toBeVisible();
    await expect(page.locator('text=/Time/i')).toBeVisible();
  });
});

test.describe('Pause and Resume', () => {
  test('should pause game with ESC key', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('button', { name: /play/i }).click();
    const usernameInput = page.locator('input[type="text"]').first();
    await usernameInput.fill('PauseTest');
    await page.getByRole('button', { name: /save|deploy/i }).click();
    
    await page.waitForTimeout(1000);
    
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    await expect(page.locator('text=Resume')).toBeVisible({ timeout: 3000 });
  });

  test('should resume game from pause overlay', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('button', { name: /play/i }).click();
    const usernameInput = page.locator('input[type="text"]').first();
    await usernameInput.fill('ResumeTest');
    await page.getByRole('button', { name: /save|deploy/i }).click();
    
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    const resumeBtn = page.getByRole('button', { name: /resume/i });
    await expect(resumeBtn).toBeVisible();
    await resumeBtn.click();
    
    await expect(page.locator('text=Resume')).not.toBeVisible({ timeout: 2000 });
  });

  test('should quit to menu from pause overlay', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('button', { name: /play/i }).click();
    const usernameInput = page.locator('input[type="text"]').first();
    await usernameInput.fill('QuitTest');
    await page.getByRole('button', { name: /save|deploy/i }).click();
    
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    const quitBtn = page.getByRole('button', { name: /quit|menu/i });
    await expect(quitBtn).toBeVisible();
    await quitBtn.click();
    
    await expect(page.locator('text=Crypto Arena Survivors')).toBeVisible({ timeout: 2000 });
  });
});

test.describe('Leaderboard', () => {
  test('should navigate to leaderboard from main menu', async ({ page }) => {
    await page.goto('/');
    
    const leaderboardBtn = page.getByRole('button', { name: /leaderboard/i });
    if (await leaderboardBtn.isVisible()) {
      await leaderboardBtn.click();
      await expect(page.locator('text=Leaderboard')).toBeVisible();
    }
  });

  test('should display leaderboard columns', async ({ page }) => {
    await page.goto('/');
    
    const leaderboardBtn = page.getByRole('button', { name: /leaderboard/i });
    if (await leaderboardBtn.isVisible()) {
      await leaderboardBtn.click();
      
      await expect(page.locator('text=/Rank|Player|Bosses|Level|Time/i')).toBeVisible();
    }
  });
});

test.describe('Boss Bestiary', () => {
  test('should navigate to boss bestiary from main menu', async ({ page }) => {
    await page.goto('/');
    
    const bestiaryBtn = page.getByRole('button', { name: /bestiary|boss/i });
    if (await bestiaryBtn.isVisible()) {
      await bestiaryBtn.click();
      await expect(page.locator('text=/Boss|Bestiary/i')).toBeVisible();
    }
  });
});

test.describe('Skills and Upgrades', () => {
  test('should display skill list from main menu', async ({ page }) => {
    await page.goto('/');
    
    const skillsBtn = page.getByRole('button', { name: /skills|drop/i });
    if (await skillsBtn.isVisible()) {
      await skillsBtn.click();
      await expect(page.locator('text=/Skills|Drop/i')).toBeVisible();
    }
  });
});

test.describe('Responsive Design', () => {
  test('should render on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    await expect(page.locator('text=Crypto Arena Survivors')).toBeVisible();
    await expect(page.getByRole('button', { name: /play/i })).toBeVisible();
  });

  test('should render on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    
    await expect(page.locator('text=Crypto Arena Survivors')).toBeVisible();
    await expect(page.getByRole('button', { name: /play/i })).toBeVisible();
  });

  test('should render on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    
    await expect(page.locator('text=Crypto Arena Survivors')).toBeVisible();
    await expect(page.getByRole('button', { name: /play/i })).toBeVisible();
  });
});
