import assert from "node:assert/strict"
import { parseChatText } from "../src/lib/chat-format.ts"

const kinds = (text: string) => parseChatText(text).map((t) => t.kind)
const value = (text: string, kind: string) => parseChatText(text).find((t) => t.kind === kind)

assert.deepEqual(kinds("*makan*"), ["bold"])
assert.equal(value("*makan*", "bold")?.value, "makan")
assert.deepEqual(kinds("_senarai_"), ["italic"])
assert.deepEqual(kinds("~lama~"), ["strike"])
assert.deepEqual(kinds("__garis__"), ["underline"])
assert.deepEqual(kinds("`kod`"), ["code"])
assert.deepEqual(kinds("a *b* c"), ["text", "bold", "text"])
assert.deepEqual(kinds("```\nbaris\n```"), ["code"])
assert.equal(value("```x\ny```", "code")?.block, true)
assert.deepEqual(kinds("https://a.my/b"), ["link"])
assert.deepEqual(kinds("**tebal**"), ["bold"])
// no markup -> single text token, markers preserved when unmatched
assert.deepEqual(kinds("2 * 3"), ["text"])
assert.equal(value("2*3*4", "text")?.value, "2")

console.log("chat-format OK")
