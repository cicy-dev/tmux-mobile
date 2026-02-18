#!/usr/bin/env node

const { chromium } = require('electron');
const path = require('path');

async function runE2E() {
  console.log('Starting E2E test...');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox']
  });
  
  const context = await browser.createIncognitoContext();
  const page = await context.newPage();
  
  // Navigate to frontend
  const frontendUrl = 'http://localhost:16901';
  console.log(`Navigating to ${frontendUrl}...`);
  
  try {
    await page.goto(frontendUrl, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('✓ Page loaded');
    
    // Check if login form is visible
    const loginExists = await page.locator('input[type="text"]').count() > 0;
    if (loginExists) {
      console.log('✓ Login form found');
    }
    
    // Get page title
    const title = await page.title();
    console.log(`✓ Page title: ${title}`);
    
    // Check for any console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Console error: ${msg.text()}`);
      }
    });
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  
  await browser.close();
  console.log('E2E test completed');
}

runE2E().catch(console.error);
