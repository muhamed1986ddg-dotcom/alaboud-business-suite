const request = require("supertest");
const { app, initializeApp } = require("../src/server");

let initPromise;
async function ready(){
  if(!initPromise)initPromise=initializeApp();
  await initPromise;
  return request(app);
}

async function login(password){
  const client=await ready();
  const candidates=password?[password]:["Admin123!ChangeMe","Admin123!JestReset"];
  for(const candidate of candidates){
    const response=await client.post("/api/auth/login").send({
      email:"admin@alaboud.local",
      password:candidate
    });
    if(response.status===200&&response.body.token)return response.body.token;
  }
  throw new Error("Test login failed for all known test passwords");
}

module.exports={ready,login};
