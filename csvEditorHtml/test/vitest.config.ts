import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({

  test: {
    browser: {
      enabled: true,
      headless: true,
      screenshotFailures: false,
      // vitest 4 takes a provider factory instead of a name, and a list of instances
      // instead of `name: 'chromium'`
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      // bind explicitly to 127.0.0.1: on windows the browser resolves "localhost" to ::1
      // while the server listens on IPv4, and every page.goto is refused
      api: { host: '127.0.0.1' },
      // vitest 4 removed `browser.testerScripts`. The globals the editor's units expect
      // are loaded by this template instead - see the comment in it for why they have to
      // stay classic scripts.
      testerHtmlPath: './csvEditorHtml/test/tester.html',
    },
    include: ['csvEditorHtml/test/**/*.test.ts'],
  },
})
