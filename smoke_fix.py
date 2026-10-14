with open('smoke2.js') as f:
    s=f.read()
s = s.replace("coins.textContent==='100'", "coins.textContent.trim()==='100'")
s = s.replace("lives.textContent==='10'", "lives.textContent.trim()==='10'")
s = s.replace("status.textContent==='Build your defense!'", "status.textContent.trim()==='Build your defense!'")
open('smoke2.js','w').write(s)
print('ok')
