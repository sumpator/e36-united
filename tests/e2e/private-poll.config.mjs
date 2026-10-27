import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
import base from '../../playwright.config.mjs';
export default defineConfig({...base,testDir:import.meta.dirname,testMatch:'private-poll.spec.mjs',projects:[{name:'chromium',use:{browserName:'chromium'}},{name:'webkit',use:{browserName:'webkit'}}],webServer:{...base.webServer,cwd:resolve(import.meta.dirname,'../..'),command:'"'+process.execPath+'" tests/e2e/server.mjs'}});
