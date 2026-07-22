const assert = require("assert");
const { PostgresEntityRepository, mergeRaw } = require("./PostgresEntityRepository");

assert.deepStrictEqual(mergeRaw({ id:"x", company_id:"co", cad_amount:"12.50", raw_payload:{ title:"Rent" } }), { title:"Rent", id:"x", companyId:"co", cadAmount:"12.50" });
(async()=>{
  const calls=[];
  const repo=new PostgresEntityRepository({table:"expenses",query:async(sql,params)=>{calls.push({sql,params});return {rows:[{id:"e1",company_id:"co1",raw_payload:{title:"Rent"}}]};}});
  const rows=await repo.listByCompany("co1",{orderBy:"created_at DESC"});
  assert.strictEqual(rows[0].title,"Rent");
  assert.match(calls[0].sql,/WHERE company_id=\$1/);
  console.log("PostgresEntityRepository selftest passed");
})().catch(error=>{console.error(error);process.exit(1);});
