import { expect, test, suite } from 'vitest'

// The cell renderer turns the urls in a value into <a> elements (util.ts). What is pinned here
// is the contract the issue's acceptance criteria rest on: the DISPLAYED text is always exactly
// the cell value, while the href may carry an added protocol - so neither the table nor an
// export can ever see a rewritten value.

/** the parts createCellValueWithUrlLinks produces for a cell value */
function partsFor(value: string): (string | HTMLElement)[] {
	const urls = containAndExtractUrl(value)
	expect(urls, `expected at least one url in ${JSON.stringify(value)}`).not.toBeNull()
	return createCellValueWithUrlLinks(value, urls!)
}

/** the parts as one string, i.e. what the user ends up reading in the cell */
function renderedText(value: string): string {
	return partsFor(value)
		.map(part => typeof part === 'string' ? part : (part as HTMLElement).innerText)
		.join('')
}

function anchorsOf(value: string): HTMLAnchorElement[] {
	return partsFor(value).filter(part => typeof part !== 'string') as HTMLAnchorElement[]
}

suite(`createCellValueWithUrlLinks`, () => {

	test(`a url with a protocol becomes one link`, () => {
		const anchors = anchorsOf(`https://example.com/a?b=1`)
		expect(anchors.length).toBe(1)
		expect(anchors[0].getAttribute('href')).toBe(`https://example.com/a?b=1`)
		expect(anchors[0].innerText).toBe(`https://example.com/a?b=1`)
	})

	test(`a url without a protocol is opened over https but displayed unchanged`, () => {
		for (const value of [`www.example.com`, `example.com/page`, `shop.ru`]) {
			const anchors = anchorsOf(value)
			expect(anchors.length, value).toBe(1)
			expect(anchors[0].getAttribute('href'), value).toBe(`https://${value}`)
			//the cell value itself must never gain the protocol
			expect(anchors[0].innerText, value).toBe(value)
		}
	})

	test(`the rendered text is exactly the cell value`, () => {
		for (const value of [
			`https://example.com`,
			`see www.example.com now`,
			`a https://one.com b two.org c`,
			`example.com, example.org`,
		]) {
			expect(renderedText(value), value).toBe(value)
		}
	})

	test(`links open in a new tab and cannot leak the opener`, () => {
		const anchor = anchorsOf(`https://example.com`)[0]
		expect(anchor.getAttribute('target')).toBe(`_blank`)
		expect(anchor.getAttribute('rel')).toBe(`noopener noreferrer`)
	})

	test(`links are not draggable, so a range selection can start on one`, () => {
		expect(anchorsOf(`https://example.com`)[0].draggable).toBe(false)
	})

	test(`the tooltip names the address that will actually be opened`, () => {
		expect(anchorsOf(`example.com`)[0].title).toBe(`https://example.com/`)
	})

	test(`several urls in one value each become their own link`, () => {
		const anchors = anchorsOf(`a https://one.com b two.org c`)
		expect(anchors.map(a => a.innerText)).toEqual([`https://one.com`, `two.org`])
		expect(anchors.map(a => a.getAttribute('href'))).toEqual([`https://one.com`, `https://two.org`])
	})

	test(`a value without a url produces no links at all`, () => {
		for (const value of [`plain text`, `report.csv`, `3.14`, `user@example.com`]) {
			expect(containAndExtractUrl(value), value).toBeNull()
		}
	})
})
