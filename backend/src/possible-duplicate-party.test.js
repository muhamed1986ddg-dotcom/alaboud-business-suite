const assert=require("assert");
const normalize=value=>String(value||"").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"");
assert.equal(normalize(" شركة العبود "),normalize("شركة-العبود"));
assert.notEqual(normalize("شركة العبود"),normalize("شركة أخرى"));
console.log("possible duplicate normalization test passed");
