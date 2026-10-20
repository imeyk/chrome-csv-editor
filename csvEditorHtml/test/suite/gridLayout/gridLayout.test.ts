import { expect, test, suite, beforeAll, afterAll } from 'vitest'

// The grid is sized by `onResizeGrid` (ui.ts), which MEASURES `#csv-editor-wrapper` - the
// element that clips the grid - instead of subtracting the toolbars from the page size. That
// only holds while the layout around the wrapper is honest about the free space, which is
// what is pinned here (issue #30):
//
// - the side panel's width really comes off the wrapper's width, so the grid is not wider
//   than the window and its vertical scrollbar + last column stay inside the clipped area
// - the stats row never grows past the bottom of the page, so the grid's horizontal
//   scrollbar stays in the visible area, and the stats scroll on their own instead
// - `html, body` carry no margin, which used to make the document taller than the window
//
// The real markup and the real stylesheet are used; the grid itself is stood in for by an
// oversized div, because a flex item that refuses to shrink is exactly the failure mode.

/** a short stand in for the browser window: shorter than the stats in the side panel */
const HOST_WIDTH = 700
const HOST_HEIGHT = 260

let host: HTMLDivElement
let page: HTMLElement

function loadMainCss(): Promise<void> {
	return new Promise((resolve, reject) => {
		const link = document.createElement('link')
		link.rel = `stylesheet`
		link.href = `/csvEditorHtml/main.css`
		link.onload = () => resolve()
		link.onerror = () => reject(new Error(`could not load /csvEditorHtml/main.css`))
		document.head.appendChild(link)
	})
}

async function pageFromSandboxHtml(): Promise<HTMLElement> {
	const response = await fetch(`/csvEditorHtml/sandbox.html`)
	expect(response.ok, `could not fetch /csvEditorHtml/sandbox.html`).toBe(true)

	//DOMParser does not run the scripts of the parsed document, and we only adopt the page
	const parsed = new DOMParser().parseFromString(await response.text(), `text/html`)
	const fullPage = parsed.getElementById(`full-page`)
	expect(fullPage, `sandbox.html has no element with id 'full-page'`).not.toBeNull()

	return fullPage as HTMLElement
}

/** the content box of the page, i.e. what its children can use */
function pageContentBox() {
	const rect = page.getBoundingClientRect()
	const style = getComputedStyle(page)
	return {
		left: rect.left + parseFloat(style.paddingLeft),
		right: rect.right - parseFloat(style.paddingRight),
		top: rect.top + parseFloat(style.paddingTop),
		bottom: rect.bottom - parseFloat(style.paddingBottom),
	}
}

const el = (id: string) => document.getElementById(id) as HTMLElement

beforeAll(async () => {
	await loadMainCss()

	//beforeDomLoaded.ts sets this before the editor's markup is laid out; main.css defaults to none
	document.documentElement.style.setProperty(`--extension-side-panel-display`, `flex`)
	//with the read/write options expanded the toolbar alone is taller than this test window,
	//so the editor's collapsed options bar state is used (toggleOptionsBar in ui.ts)
	document.documentElement.style.setProperty(`--extension-options-bar-display`, `none`)

	host = document.createElement(`div`)
	host.style.cssText = `position:fixed;top:0;left:0;overflow:hidden;width:${HOST_WIDTH}px;height:${HOST_HEIGHT}px`
	page = await pageFromSandboxHtml()
	host.appendChild(page)
	document.body.appendChild(host)

	//stand in for the rendered grid: much larger than the space it is allowed to have
	el(`csv-editor`).style.width = `3000px`
	el(`csv-editor`).style.height = `3000px`
})

afterAll(() => {
	host.remove()
})

suite(`the editor page's grid layout`, () => {

	test(`html and body have no margin of their own`, () => {
		for (const element of [document.documentElement, document.body]) {
			const style = getComputedStyle(element)
			expect([style.marginTop, style.marginRight, style.marginBottom, style.marginLeft])
				.toEqual([`0px`, `0px`, `0px`, `0px`])
		}
	})

	test(`the side panel's width comes off the grid wrapper`, () => {
		const panel = el(`side-panel`).getBoundingClientRect()
		const wrapper = el(`csv-editor-wrapper`).getBoundingClientRect()
		const content = pageContentBox()

		expect(panel.width, `the side panel should be visible in this test`).toBeGreaterThan(0)
		//no gap and no overlap between the two
		expect(wrapper.left).toBeCloseTo(panel.right, 0)
		//...and together they are the page, so the grid is never wider than the window
		expect(wrapper.right).toBeCloseTo(content.right, 0)
		expect(wrapper.width).toBeCloseTo(content.right - content.left - panel.width, 0)
	})

	test(`the stats do not push the grid past the bottom of the page`, () => {
		const content = pageContentBox()
		const sidePaneled = document.querySelector(`.side-paneled`)!.getBoundingClientRect()
		const wrapper = el(`csv-editor-wrapper`).getBoundingClientRect()

		expect(sidePaneled.top, `the toolbars should leave room for the grid in this test window`)
			.toBeLessThan(content.bottom)
		//the stats are taller than this window: the row must stay inside the page anyway
		expect(el(`side-panel-inner`).scrollHeight).toBeGreaterThan(el(`side-panel-inner`).clientHeight)
		expect(sidePaneled.bottom).toBeLessThanOrEqual(content.bottom + 0.5)
		expect(wrapper.bottom).toBeLessThanOrEqual(content.bottom + 0.5)
	})

	test(`the oversized grid does not stretch the wrapper it is measured on`, () => {
		const wrapper = el(`csv-editor-wrapper`)

		expect(wrapper.clientWidth).toBeGreaterThan(0)
		expect(wrapper.clientHeight).toBeGreaterThan(0)
		//what onResizeGrid hands to handsontable has to fit the window, not the grid's content
		expect(wrapper.clientWidth).toBeLessThan(HOST_WIDTH)
		expect(wrapper.clientHeight).toBeLessThan(HOST_HEIGHT)
	})

	test(`every stat can be scrolled to inside the panel`, () => {
		const inner = el(`side-panel-inner`)
		const groups = inner.querySelectorAll(`.stat-group`)
		expect(groups.length).toBeGreaterThan(0)

		inner.scrollTop = inner.scrollHeight
		const last = groups[groups.length - 1].getBoundingClientRect()
		expect(last.bottom).toBeLessThanOrEqual(inner.getBoundingClientRect().bottom + 1)
		inner.scrollTop = 0
	})

	test(`a stat is one line: label and value never wrap`, () => {
		const rows = document.querySelectorAll(`.side-panel .stat-row`)
		expect(rows.length).toBeGreaterThan(0)

		for (const row of rows) {
			const label = row.querySelector(`.stat-label`) as HTMLElement
			const text = label.textContent!.trim()
			//a wrapped label renders as more than one line box - that is the ragged panel
			expect(label.getClientRects().length, `the label '${text}' wraps`).toBe(1)
			expect(row.scrollWidth, `the row '${text}' is wider than the panel`)
				.toBeLessThanOrEqual(row.clientWidth + 1)
		}
	})

})
