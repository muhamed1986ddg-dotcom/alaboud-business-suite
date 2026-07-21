const { ready, login } = require("./test-app");

describe("Financial APIs",()=>{
  test("records CAD-normalized capital and expenses",async()=>{
    const client=await ready();
    const token=await login();

    const capital=await client.post("/api/capital")
      .set("Authorization",`Bearer ${token}`)
      .send({type:"IN",amount:1000,currency:"CAD",description:"Jest capital"});
    expect(capital.status).toBe(201);
    expect(capital.body.cadAmount).toBe(1000);

    const expense=await client.post("/api/expenses")
      .set("Authorization",`Bearer ${token}`)
      .send({title:"Jest expense",amount:100,currency:"USD",exchangeRate:1.35,category:"Test"});
    expect(expense.status).toBe(201);
    expect(expense.body.cadAmount).toBe(135);

    const overview=await client.get("/api/capital-overview").set("Authorization",`Bearer ${token}`);
    expect(overview.status).toBe(200);
    expect(Number.isFinite(overview.body.totalMoney)).toBe(true);
    expect(Number.isFinite(overview.body.netCapital)).toBe(true);
  });
});
