const assert = require("assert");
const { PostgresEntityRepository, mergeRaw } = require("./PostgresEntityRepository");

assert.deepStrictEqual(mergeRaw({ id:"x", company_id:"co", cad_amount:"12.50", raw_payload:{ title:"Rent" } }), { title:"Rent", id:"x", companyId:"co", cadAmount:"12.50" });
(async()=>{
  const calls=[];
  const repo=new PostgresEntityRepository({table:"expenses",query:async(sql,params)=>{calls.push({sql,params});return {rows:[{id:"e1",company_id:"co1",raw_payload:{title:"Rent"}}]};}});
  const rows=await repo.listByCompany("co1",{orderBy:"created_at DESC"});
  assert.strictEqual(rows[0].title,"Rent");
  assert.match(calls[0].sql,/WHERE company_id=\$1/);

  const customerCalls=[];
  const customerRepo=new PostgresEntityRepository({
    table:"customers",
    query:async(sql,params)=>{
      customerCalls.push({sql,params});
      if(/COUNT\(\*\)/.test(sql))return {rows:[{count:1}]};
      return {rows:[{id:"c1",company_id:"co1",name:"Customer",phone:"+1 519-555-0100",customer_balance_cad:0,overdue_days:0,raw_payload:{customerNumber:"١٠١"}}]};
    }
  });
  const customerPage=await customerRepo.listCustomersPage("co1",{search:"١ 519-555",limit:20,offset:0});
  assert.strictEqual(customerPage.total,1);
  assert.strictEqual(customerPage.rows[0].customerNumber,"١٠١");
  assert.strictEqual(customerCalls[0].params[2],"%1519555%");
  assert.match(customerCalls[0].sql,/regexp_replace\(COALESCE\(c\.phone/);
  console.log("PostgresEntityRepository selftest passed");
})().catch(error=>{console.error(error);process.exit(1);});
