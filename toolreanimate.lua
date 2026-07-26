--[[
	tool reanimate — Solara-friendly FE tool dancer.
	Krystal dances + combat gears. No .anim/buffer dependency.
]]

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local InsertService = game:GetService("InsertService")
local Workspace = game:GetService("Workspace")
local CoreGui = game:GetService("CoreGui")
local Debris = game:GetService("Debris")

if getgenv().ToolDancerFE == true then return end
getgenv().ToolDancerFE = true

local plr = Players.LocalPlayer
local chr = plr.Character
local hrp = chr:WaitForChild("HumanoidRootPart")
local hum = chr:WaitForChild("Humanoid")
local bp = plr:WaitForChild("Backpack")

-- ── State ──
local feTools = {}
local refParts = {}
local dancing = false
local playAnother = false
local currentGear = 0
local canFire = true
local physMode = 1

-- ── Config ──
local CONFIG = {
	projectileSpeed = 150, explosionRadius = 8, explosionPressure = 50000,
	trailLifetime = 0.4, meleeRange = 4, toolSpread = 3,
	cooldownGun = 0.5, cooldownMelee = 0.3, simRadius = 2147483647,
	antiSleep = true, showCamera = true, cameraDistance = -8,
	lerpFactor = 15, destroyGrip = true,
}

-- ── Notifications ──
local notifGui = Instance.new("ScreenGui")
notifGui.Name = "DancerFENotif"; notifGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
notifGui.Parent = (gethui and gethui()) or (cloneref and cloneref(CoreGui)) or CoreGui or plr:WaitForChild("PlayerGui")
local notifContainer = Instance.new("Frame", notifGui)
notifContainer.Size = UDim2.new(0,260,1,-20); notifContainer.Position = UDim2.new(1,-270,0,10); notifContainer.BackgroundTransparency = 1
Instance.new("UIListLayout", notifContainer).VerticalAlignment = Enum.VerticalAlignment.Bottom

local function notify(title, text, color)
	local n = Instance.new("Frame", notifContainer)
	n.Size,n.BackgroundTransparency,n.BorderSizePixel = UDim2.new(0,0,0,50),0.3,0; n.BackgroundColor3 = Color3.fromRGB(10,10,10)
	local s = Instance.new("UIStroke",n); s.Color = Color3.fromRGB(60,60,60); s.Transparency = 0.5; s.Thickness = 1
	local a = Instance.new("Frame",n); a.Size = UDim2.new(0,3,1,0); a.BackgroundColor3 = color or Color3.fromRGB(150,150,150); a.BorderSizePixel = 0
	local t = Instance.new("TextLabel",n); t.Text = title:upper(); t.Position = UDim2.new(0,12,0.15,0); t.Size = UDim2.new(1,-20,0,15)
	t.Font,t.TextColor3,t.TextSize,t.BackgroundTransparency,t.TextXAlignment = Enum.Font.Code,Color3.new(1,1,1),13,1,Enum.TextXAlignment.Left
	local m = Instance.new("TextLabel",n); m.Text = text; m.Position = UDim2.new(0,12,0.5,0); m.Size = UDim2.new(1,-20,0,15)
	m.Font,m.TextColor3,m.TextSize,m.BackgroundTransparency,m.TextXAlignment = Enum.Font.Code,Color3.fromRGB(170,170,170),11,1,Enum.TextXAlignment.Left
	TweenService:Create(n,TweenInfo.new(0.3,Enum.EasingStyle.Quart,Enum.EasingDirection.Out),{Size=UDim2.new(1,0,0,50)}):Play()
	task.delay(2,function()
		local t = TweenService:Create(n,TweenInfo.new(0.3,Enum.EasingStyle.Quart,Enum.EasingDirection.In),{Size=UDim2.new(0,0,0,50)})
		t:Play(); t.Completed:Wait(); n:Destroy()
	end)
end

-- ── Setup ──
local worldPos = hrp.CFrame
local function setupCharacter()
	hrp.CFrame = CFrame.new(0,-500,0)
	hum.BreakJointsOnDeath = false; hum.MaxHealth = math.huge; hum.Health = math.huge
	for _, p in ipairs(chr:GetDescendants()) do if p:IsA("BasePart") then p.CanCollide = false end end
end

local function setupFETool(tool)
	if not tool or not tool:IsA("Tool") then return end
	local h = tool:FindFirstChild("Handle") or tool:FindFirstChildWhichIsA("BasePart")
	if not h then return end
	tool.Parent = bp; tool.Parent = chr; tool.Parent = bp; tool.Parent = Workspace; tool.Parent = chr
	local ref = Instance.new("Part",Workspace)
	ref.Name = "DancerRef_"..tool.Name; ref.Anchored = true; ref.CanCollide = false; ref.Transparency = 1
	ref.Size = Vector3.new(0.2,0.2,0.2); ref.CFrame = worldPos*CFrame.new(0,math.random(-3,3),0)
	table.insert(refParts, ref)
	local ap = Instance.new("AlignPosition",h); ap.MaxForce = math.huge; ap.MaxVelocity = math.huge; ap.Responsiveness = 200
	ap.Attachment0 = Instance.new("Attachment",h); ap.Attachment1 = Instance.new("Attachment",ref)
	local av = Instance.new("BodyAngularVelocity",h); av.MaxTorque = Vector3.new(math.huge,math.huge,math.huge); av.P = 1250
	table.insert(feTools, {tool=tool,handle=h,refPart=ref,align=ap,angular=av})
end

local function setupAllTools()
	for _, v in ipairs(feTools) do
		if v.align then v.align:Destroy() end; if v.angular then v.angular:Destroy() end; if v.refPart then v.refPart:Destroy() end
	end
	for _, r in ipairs(refParts) do if r and r.Parent then r:Destroy() end end
	table.clear(feTools); table.clear(refParts)
	local tools = {}
	for _, v in ipairs(bp:GetChildren()) do if v:IsA("Tool") then table.insert(tools,v) end end
	for _, v in ipairs(chr:GetChildren()) do if v:IsA("Tool") and not table.find(tools,v) then table.insert(tools,v) end end
	for _, tool in ipairs(tools) do if #feTools >= 6 then break end; setupFETool(tool) end
end

-- ── Dance Player ──
local function kfToTbl(kf)
	local t = {}
	for _, v in ipairs(kf:GetDescendants()) do if v:IsA("Pose") then t[v.Name:sub(1,1)..v.Name:sub(-1)] = v.CFrame end end
	return t
end

local function loadAndPlay(assetId, speed)
	if dancing then return end; speed = speed or 1; dancing = true; playAnother = false
	local ok, animAsset = pcall(function() return InsertService:LoadLocalAsset("rbxassetid://"..assetId) end)
	if not ok or not animAsset then notify("Error","Failed to load anim",Color3.fromRGB(255,100,100)); dancing = false; return end
	animAsset.Parent = Workspace
	local anim = {}; for _, v in ipairs(animAsset:GetChildren()) do if v:IsA("Keyframe") then anim[v.Time] = kfToTbl(v) end end
	local times = {}; for t,_ in pairs(anim) do table.insert(times,t) end; table.sort(times)
	if #times == 0 then dancing = false; return end
	local ct=0; local ci=1; local lp=nil; local lkt=0; local bl=0
	while dancing and not playAnother do
		local dt = RunService.Heartbeat:Wait(); ct = ct + dt
		while ci <= #times and ct >= times[ci]/speed do lp = anim[times[ci]]; lkt = times[ci]; ci = ci+1; bl = 0 end
		if ci > #times then ct=0; ci=1; lp=nil; lkt=0; bl=0
		elseif lp then
			local np = anim[times[ci]]; local dur = (times[ci]-lkt)/speed
			if dur > 0 then bl = bl + dt end; local a = dur > 0 and math.min(bl/dur,1) or 1
			for i, ft in ipairs(feTools) do if ft.refPart and ft.refPart.Parent then
				local pk = ({[1]="Lm",[2]="Rm",[3]="Lg",[4]="Rg",[5]="Hd"})[i] or "To"
				local pcf
				if lp[pk] and np and np[pk] then pcf = lp[pk]:Lerp(np[pk],a)
				elseif lp[pk] then pcf = lp[pk] end
				if pcf then
					local rad = 3+(i*0.5); local ang = (i/#feTools)*math.pi*2; local off = pcf.p*2.5
					local target = hrp.CFrame * CFrame.new(math.sin(ang)*rad+off.X, off.Y+1.5, math.cos(ang)*rad+off.Z)
					local sm = 1 - math.exp(-CONFIG.lerpFactor * dt)
					ft.refPart.CFrame = ft.refPart.CFrame:Lerp(target, sm)
				end
			end end
		end
	end
	for _, at in ipairs(feTools) do if at.refPart then at.refPart.CFrame = worldPos end end
	dancing = false; notify("Dancer","Stopped",Color3.fromRGB(200,200,200))
end

-- ── Combat Gears ──
local function meleeAttack()
	if not canFire or #feTools == 0 then return end; canFire = false
	for i, ft in ipairs(feTools) do if ft.refPart and ft.refPart.Parent then
		local ang = (i/#feTools)*math.pi*2
		ft.refPart.CFrame = hrp.CFrame * CFrame.new(math.sin(ang)*CONFIG.meleeRange, 1, math.cos(ang)*CONFIG.meleeRange) * CFrame.Angles(math.rad(-45+math.random(-20,20)), math.rad(math.random(-30,30)), 0)
		task.spawn(function() task.wait(0.1) if ft.refPart and ft.refPart.Parent then ft.refPart.CFrame = hrp.CFrame * CFrame.new(math.sin(ang)*CONFIG.toolSpread, 0, math.cos(ang)*CONFIG.toolSpread) end end)
	end end
	notify("MELEE","Slash!",Color3.fromRGB(255,200,100))
	task.wait(CONFIG.cooldownMelee); canFire = true
end

local function fireTool(ft, dir, vel, mods)
	if not ft or not ft.handle then return end
	local h = ft.handle
	h:BreakJoints(); h.Parent = Workspace; h.Anchored = false; h.CanCollide = true
	h.Velocity = vel or dir*80; h.RotVelocity = Vector3.new(math.random(-10,10),math.random(-10,10),math.random(-10,10))
	if ft.align then ft.align:Destroy() end; if ft.angular then ft.angular:Destroy() end; if ft.refPart then ft.refPart:Destroy() end
	Debris:AddItem(h,5)
	local idx = table.find(feTools,ft); if idx then table.remove(feTools,idx) end
	if mods then
		if mods.trail then local tr=Instance.new("Trail",h); tr.Attachment0=Instance.new("Attachment",h); tr.Attachment1=Instance.new("Attachment",h); tr.Attachment1.CFrame=CFrame.new(0,0,-1)
			tr.Color=mods.trail.color; tr.Transparency=NumberSequence.new(0,1); tr.Lifetime=mods.trail.lifetime; tr.Width=mods.trail.width end
		if mods.explosion then local con=h.Touched:Connect(function(hp) if hp and hp:IsA("BasePart") and not hp:IsDescendantOf(chr) then
			local e=Instance.new("Explosion",Workspace); e.Position=h.Position; e.BlastRadius=mods.explosion.radius; e.BlastPressure=mods.explosion.pressure; e.ExplosionType=Enum.ExplosionType.NoCraters; con:Disconnect() end end) end
	end
end

local function refillTools()
	local tools={}; local existing={}
	for _,v in ipairs(feTools) do existing[v.tool]=true end
	for _,v in ipairs(bp:GetChildren()) do if v:IsA("Tool") and not existing[v] then table.insert(tools,v) end end
	for _,v in ipairs(chr:GetChildren()) do if v:IsA("Tool") and not table.find(tools,v) and not existing[v] then table.insert(tools,v) end end
	for _,tool in ipairs(tools) do if #feTools >= 6 then break end; setupFETool(tool) end
end

local function gunFire()
	if not canFire or #feTools == 0 then return end; canFire = false
	local cam = Workspace.CurrentCamera; local mousePos = Vector3.new()
	if cam then
		local mPos = UserInputService:GetMouseLocation()
		local ray = cam:ViewportPointToRay(mPos.X, mPos.Y)
		local hit, pos = Workspace:FindPartOnRay(Ray.new(ray.Origin, ray.Direction*500), chr)
		mousePos = (hit and pos) or (ray.Origin + ray.Direction*500)
	end
	local dir = (mousePos - hrp.Position).Unit; local vel = dir * CONFIG.projectileSpeed
	local toFire = {}; for _, ft in ipairs(feTools) do table.insert(toFire, ft) end
	for _, ft in ipairs(toFire) do
		if currentGear == 8 then fireTool(ft, dir, vel)
		elseif currentGear == 9 then fireTool(ft, dir, vel, {explosion={radius=CONFIG.explosionRadius,pressure=CONFIG.explosionPressure},trail={color=ColorSequence.new(Color3.fromRGB(255,200,50),Color3.fromRGB(255,50,50)),lifetime=CONFIG.trailLifetime,width=0.5}}) end
	end
	task.wait(0.1); refillTools()
	notify("GUN",currentGear==9 and "Gear 9 [Effects]" or "Gear 8 [Plain]",Color3.fromRGB(255,100,50))
	task.wait(CONFIG.cooldownGun); canFire = true
end

local physNames = {"Sword Throw","Time Bomb","Bouncy Ball","Eyeozen Ball"}
local function physFire()
	if not canFire or #feTools == 0 then return end; canFire = false
	local cam = Workspace.CurrentCamera; local mousePos = Vector3.new()
	if cam then
		local mPos = UserInputService:GetMouseLocation()
		local ray = cam:ViewportPointToRay(mPos.X, mPos.Y)
		local hit, pos = Workspace:FindPartOnRay(Ray.new(ray.Origin, ray.Direction*500), chr)
		mousePos = (hit and pos) or (ray.Origin + ray.Direction*500)
	end
	local dir = (mousePos - hrp.Position).Unit; local mode = physMode
	notify("GEAR 10",physNames[mode],Color3.fromRGB(200,150,255))
	local toFire = {}; for _, ft in ipairs(feTools) do table.insert(toFire, ft) end
	for _, ft in ipairs(toFire) do
		if mode == 1 then fireTool(ft, dir, dir*80+Vector3.new(0,30,0), {trail={color=ColorSequence.new(Color3.fromRGB(200,200,200),Color3.fromRGB(100,100,100)),lifetime=0.3,width=0.4}})
		elseif mode == 2 then fireTool(ft, dir, dir*40, {})
			task.spawn(function() task.wait(2) if ft.handle and ft.handle.Parent then
				local e=Instance.new("Explosion",Workspace); e.Position=ft.handle.Position; e.BlastRadius=CONFIG.explosionRadius*1.5; e.BlastPressure=CONFIG.explosionPressure*2; e.ExplosionType=Enum.ExplosionType.NoCraters
			end end)
		elseif mode == 3 then fireTool(ft, dir, dir*120+Vector3.new(0,20,0), {trail={color=ColorSequence.new(Color3.fromRGB(200,150,255),Color3.fromRGB(100,200,255)),lifetime=0.3,width=0.3}})
			ft.handle.Elasticity=0.8; ft.handle.Friction=0.3; ft.handle.Size=Vector3.new(1,1,1)
		elseif mode == 4 then fireTool(ft, dir, dir*60, {trail={color=ColorSequence.new(Color3.fromRGB(100,200,255),Color3.fromRGB(50,100,200)),lifetime=0.4,width=0.3}})
			local bf=Instance.new("BodyForce",ft.handle); bf.Force=Vector3.new(0,workspace.Gravity*ft.handle:GetMass()*0.5,0)
			task.spawn(function() local t=0 while ft.handle and ft.handle.Parent and t<4 do t=t+0.1;task.wait(0.1) if ft.handle and ft.handle.Parent then
				local push=Instance.new("BodyVelocity",ft.handle); push.Velocity=(mousePos-ft.handle.Position).Unit*50; push.MaxForce=Vector3.new(1000,1000,1000); Debris:AddItem(push,0.15) end end end)
		end
	end
	task.wait(0.1); refillTools(); task.wait(CONFIG.cooldownGun); canFire = true
end

-- ── Physics ──
RunService.Stepped:Connect(function() settings().Physics.AllowSleep = false; plr.SimulationRadius = CONFIG.simRadius end)
RunService.PostSimulation:Connect(function(dt)
	if not getgenv().ToolDancerFE or not hrp or not hrp.Parent then return end
	local ct = os.clock()
	for _, ft in ipairs(feTools) do
		if ft.handle and ft.handle:IsA("BasePart") then
			local tp = ft.refPart and ft.refPart.Parent and ft.refPart.Position or worldPos.p
			local dir = tp - ft.handle.Position; local xz = Vector3.new(dir.X,0,dir.Z)
			local vz = xz.Magnitude>0 and xz.Unit*xz.Magnitude*2 or Vector3.zero
			ft.handle.AssemblyLinearVelocity = Vector3.new(vz.X,220.290009+math.sin(ct),vz.Z)
			ft.handle.AssemblyAngularVelocity = Vector3.new(0,math.huge,math.huge)
		end
	end
end)

-- ── Camera ──
local camPart = Instance.new("Part",Workspace); camPart.Name = "DancerFECam"; camPart.Anchored = true; camPart.CanCollide = false; camPart.Transparency = 1; camPart.Size = Vector3.new(0.2,0.2,0.2)
RunService.RenderStepped:Connect(function(dt)
	if not getgenv().ToolDancerFE or not chr or not chr.Parent then return end
	local center = Vector3.zero; local cnt = 0
	for _, ft in ipairs(feTools) do if ft.handle then center = center+ft.handle.Position; cnt = cnt+1 end end
	if cnt > 0 then center = center/cnt; local cam = Workspace.CurrentCamera
		if cam then
			local sm = 1 - math.exp(-CONFIG.lerpFactor * dt)
			camPart.CFrame = camPart.CFrame:Lerp(CFrame.lookAt(center,center+cam.CFrame.LookVector), sm)
			cam.CameraSubject = camPart; cam.CameraType = Enum.CameraType.Scriptable
			cam.CFrame = camPart.CFrame*CFrame.new(0,0,CONFIG.cameraDistance)
		end
	end
	if sethiddenproperty then pcall(function() sethiddenproperty(plr,"SimulationRadius",CONFIG.simRadius) end) end
end)

-- ── Dance Pages ──
local pages = {
	{name="KRYSTAL1",dances={
		{key="q",id="106353328250763",name="Rat"},{key="e",id="16769959846",name="Boogie",sp=2},
		{key="r",id="136962185637891",name="Valen"},{key="t",id="130968726197789",name="Order",sp=2},
		{key="y",id="100864643591096",name="Sturdy"},{key="u",id="103597509139287",name="Caramell"},
		{key="f",id="18945296583",name="Billy"},{key="g",id="12438774071",name="Gangnam"},
		{key="p",id="8829798048",name="Pogo",sp=1.5},{key="j",id="96444866125796",name="DancingIn"},
		{key="k",id="12637912409",name="DR",sp=2},{key="l",id="15704995372",name="Griddy"},
		{key="z",id="15092317950",name="Lux"},{key="x",id="114036336168567",name="Kazot"},
		{key="h",id="76647570617571",name="H",sp=0.75},{key="v",id="16361564081",name="BimBam"},
		{key="c",id="118766274919427",name="Moongazer"},{key="n",id="111249002064299",name="Down"},
	}},
	{name="KRYSTAL2",dances={
		{key="q",id="73559770055600",name="XO"},{key="e",id="100177280567649",name="Drip"},
		{key="r",id="101564911432113",name="Freeflow"},{key="t",id="83266223088944",name="Whatever"},
		{key="y",id="15039779727",name="Balls"},{key="h",id="10609437925",name="Faster"},
		{key="g",id="14887006269",name="Tryna"},{key="f",id="125834337223799",name="Chronoshift"},
		{key="j",id="93585895457618",name="DancingWit"},{key="k",id="70835462045983",name="FrightFunk"},
		{key="u",id="132026285699359",name="Bloodpop"},{key="n",id="90819860436349",name="N"},
		{key="z",id="137845929482571",name="LeftRight"},{key="x",id="85856686932206",name="HeavyLove"},
		{key="c",id="109123683211464",name="Million"},{key="v",id="118311613925473",name="ChaseMe"},
	}},
	{name="KRYSTAL3",dances={
		{key="q",id="73116243097694",name="Crisscross"},{key="e",id="86485871533985",name="Brain"},
		{key="r",id="13357063395",name="Duck"},{key="t",id="87342159331194",name="Espresso"},
		{key="y",id="18985726113",name="Rakuten"},{key="u",id="8915458946",name="DayNNight"},
		{key="f",id="79630525228564",name="Tort"},{key="g",id="120262284704633",name="Lemon",sp=0.8},
		{key="h",id="84471848998012",name="Boom"},{key="j",id="90069083924245",name="Doodle",sp=2},
		{key="k",id="72723551972407",name="Hypno"},{key="z",id="15705077587",name="Assum"},
		{key="x",id="109990576374190",name="Rotten",sp=2},{key="c",id="84587788869282",name="Decadent",sp=0.35},
		{key="v",id="100305033962391",name="Misc",sp=2},{key="n",id="71723925114737",name="Jung"},
	}},
	{name="GEAR:MELEE",keymode="gear7",dances={{key="7",name="7th Gear: Melee",gear=7,desc="Click to slash tools"}}},
	{name="GEAR:GUN",keymode="gear8",dances={
		{key="8",name="8th Gear: Gun",gear=8,desc="Plain projectile"},
		{key="9",name="9th Gear: Effects",gear=9,desc="Trail + explosion"},
	}},
	{name="OPTS",keymode="opts",dances={}},
	{name="YT:RADIO",keymode="ytradio",dances={}},
	{name="GEAR:PHYS",keymode="gear10",dances={{key="0",name="10th Gear: Physics Proj.",gear=10,desc="Click to cycle: Sword/Bomb/Ball/Eyeozen"}}},
}
local currentPageIdx = 1

-- ── UI ──
local function createMenu()
	if getgenv().DancerMenu then getgenv().DancerMenu:Destroy() end
	local gui = Instance.new("ScreenGui"); gui.Name = "DancerMenu"; gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	gui.Parent = (gethui and gethui()) or (cloneref and cloneref(CoreGui)) or CoreGui or plr:WaitForChild("PlayerGui")
	getgenv().DancerMenu = gui
	local frame = Instance.new("Frame", gui)
	frame.Size = UDim2.new(0,340,0,440); frame.Position = UDim2.new(1,-350,0,10)
	frame.BackgroundColor3 = Color3.fromRGB(8,8,8); frame.BackgroundTransparency = 0.2; frame.BorderSizePixel = 0
	frame.Active = true; frame.Draggable = true
	Instance.new("UICorner", frame).CornerRadius = UDim.new(0,8)
	local stroke = Instance.new("UIStroke", frame); stroke.Color = Color3.fromRGB(80,80,80); stroke.Transparency = 0.5; stroke.Thickness = 1
	local header = Instance.new("TextLabel", frame)
	header.Size = UDim2.new(1,-20,0,28); header.Position = UDim2.new(0,10,0,6); header.BackgroundTransparency = 1
	header.Text = "TOOL DANCER // GEAR "..currentGear; header.TextColor3 = Color3.fromRGB(200,200,200); header.Font = Enum.Font.Code; header.TextSize = 13; header.TextXAlignment = Enum.TextXAlignment.Left
	local tabFrame = Instance.new("Frame", frame); tabFrame.Position = UDim2.new(0,8,0,35); tabFrame.Size = UDim2.new(1,-16,0,22); tabFrame.BackgroundTransparency = 1
	for i, p in ipairs(pages) do
		local tab = Instance.new("TextButton", tabFrame)
		tab.Size = UDim2.new(0,46,1,0); tab.Position = UDim2.new(0,(i-1)*47,0,0)
		local label = p.name:match("GEAR") and ("⚙"..p.name:sub(6,6)) or p.name:sub(1,8)
		tab.Text = label; tab.Font = Enum.Font.Code; tab.TextSize = 7; tab.TextColor3 = p.name:match("GEAR") and Color3.fromRGB(255,200,50) or Color3.fromRGB(200,200,200)
		tab.BackgroundColor3 = i == currentPageIdx and Color3.fromRGB(50,50,50) or Color3.fromRGB(20,20,20); tab.BorderSizePixel = 0
		Instance.new("UICorner", tab).CornerRadius = UDim.new(0,4)
		tab.MouseButton1Click:Connect(function()
			currentPageIdx = i
			if p.keymode and p.keymode:match("gear") then currentGear = tonumber(p.keymode:match("%d+")) or 0; notify("GEAR","Gear "..currentGear.." active",Color3.fromRGB(255,200,50))
			else currentGear = 0; notify("Dancer","Page: "..p.name,Color3.fromRGB(100,200,255)) end
			header.Text = "TOOL DANCER // GEAR "..currentGear
			if gui:FindFirstChild("ListFrame") then gui.ListFrame:Destroy() end
			buildList(gui, frame)
			for _, t in ipairs(tabFrame:GetChildren()) do if t:IsA("TextButton") then t.BackgroundColor3 = Color3.fromRGB(20,20,20) end end
			tab.BackgroundColor3 = Color3.fromRGB(50,50,50)
		end)
	end
	buildList(gui, frame)
	local status = Instance.new("TextLabel", frame)
	status.Size = UDim2.new(1,-20,0,18); status.Position = UDim2.new(0,10,1,-22); status.BackgroundTransparency = 1
	status.Text = "Click dance | 7/8/9/0 for gear | M=cycle | 1=stop"; status.TextColor3 = Color3.fromRGB(100,100,100); status.Font = Enum.Font.Code; status.TextSize = 8; status.TextXAlignment = Enum.TextXAlignment.Left
end

local function buildList(gui, frame)
	local listFrame = Instance.new("ScrollingFrame", gui); listFrame.Name = "ListFrame"
	listFrame.Size = UDim2.new(0,320,0,350); listFrame.Position = UDim2.new(0,10,0,62)
	listFrame.BackgroundTransparency = 1; listFrame.ScrollBarThickness = 3; listFrame.ScrollBarImageColor3 = Color3.fromRGB(100,100,100)
	listFrame.CanvasSize = UDim2.new(0,0,0,0); listFrame.AutomaticCanvasSize = Enum.AutomaticSize.Y
	local page = pages[currentPageIdx]
	if page.keymode == "opts" then
		-- settings page
		local layout = Instance.new("UIListLayout", listFrame); layout.Padding = UDim.new(0,4); layout.SortOrder = Enum.SortOrder.LayoutOrder
		Instance.new("TextLabel", listFrame).Size = UDim2.new(1,-6,0,26); Instance.new("TextLabel", listFrame).BackgroundTransparency = 1
		local opts = {{label="Proj. Speed",key="projectileSpeed",min=50,max=500,val=CONFIG.projectileSpeed},{label="Exp. Rad",key="explosionRadius",min=2,max=30,val=CONFIG.explosionRadius},{label="Gun CD",key="cooldownGun",min=0.1,max=2,val=CONFIG.cooldownGun,step=0.1},{label="Melee CD",key="cooldownMelee",min=0.1,max=1.5,val=CONFIG.cooldownMelee,step=0.1},{label="Lerp",key="lerpFactor",min=1,max=30,val=CONFIG.lerpFactor,step=1},{label="Cam Dist",key="cameraDistance",min=-20,max=-2,val=CONFIG.cameraDistance,step=1},{label="Destroy Grip",key="destroyGrip",type="toggle",val=CONFIG.destroyGrip},}
		for _, o in ipairs(opts) do
			local e = Instance.new("Frame", listFrame); e.Size = UDim2.new(1,-6,0,28); e.BackgroundColor3 = Color3.fromRGB(20,20,20); e.BorderSizePixel = 0
			Instance.new("UICorner", e).CornerRadius = UDim.new(0,4)
			local l = Instance.new("TextLabel", e); l.Size = UDim2.new(0.5,0,1,0); l.Position = UDim2.new(0,8,0,0); l.BackgroundTransparency = 1
			l.Text = o.label; l.Font = Enum.Font.Code; l.TextSize = 11; l.TextColor3 = Color3.fromRGB(180,180,180); l.TextXAlignment = Enum.TextXAlignment.Left
			if o.type == "toggle" then
				local tb = Instance.new("TextButton", e); tb.Size = UDim2.new(0,40,0,20); tb.Position = UDim2.new(1,-48,0,4)
				tb.Text = o.val and "ON" or "OFF"; tb.Font = Enum.Font.Code; tb.TextSize = 10
				tb.BackgroundColor3 = o.val and Color3.fromRGB(50,100,50) or Color3.fromRGB(50,50,50); tb.BorderSizePixel = 0
				Instance.new("UICorner", tb).CornerRadius = UDim.new(0,4); tb.TextColor3 = Color3.fromRGB(200,200,200)
				tb.MouseButton1Click:Connect(function() CONFIG[o.key] = not CONFIG[o.key]; tb.Text = CONFIG[o.key] and "ON" or "OFF"; tb.BackgroundColor3 = CONFIG[o.key] and Color3.fromRGB(50,100,50) or Color3.fromRGB(50,50,50); notify("Config",o.label..": "..tostring(CONFIG[o.key]),Color3.fromRGB(150,150,150)) end)
			else
				local st = o.step or 1
				local vd = Instance.new("TextLabel", e); vd.Size = UDim2.new(0,40,1,0); vd.Position = UDim2.new(1,-48,0,0); vd.BackgroundTransparency = 1
				vd.Text = tostring(o.val); vd.Font = Enum.Font.Code; vd.TextSize = 11; vd.TextColor3 = Color3.fromRGB(200,200,100); vd.TextXAlignment = Enum.TextXAlignment.Right
				local mi = Instance.new("TextButton", e); mi.Size = UDim2.new(0,24,0,20); mi.Position = UDim2.new(1,-24,0,4); mi.Text = "-"; mi.Font = Enum.Font.Code; mi.TextSize = 12
				mi.BackgroundColor3 = Color3.fromRGB(60,30,30); mi.BorderSizePixel = 0; Instance.new("UICorner", mi).CornerRadius = UDim.new(0,4); mi.TextColor3 = Color3.fromRGB(200,200,200)
				local pl = Instance.new("TextButton", e); pl.Size = UDim2.new(0,24,0,20); pl.Position = UDim2.new(1,-24,0,4); pl.Text = "+"; pl.Font = Enum.Font.Code; pl.TextSize = 12
				pl.BackgroundColor3 = Color3.fromRGB(30,60,30); pl.BorderSizePixel = 0; Instance.new("UICorner",pl).CornerRadius = UDim.new(0,4); pl.TextColor3 = Color3.fromRGB(200,200,200)
				mi.MouseButton1Click:Connect(function() CONFIG[o.key]=math.max(o.min,CONFIG[o.key]-st); vd.Text=tostring(CONFIG[o.key]); notify("Config",o.label..": "..CONFIG[o.key],Color3.fromRGB(150,150,150)) end)
				pl.MouseButton1Click:Connect(function() CONFIG[o.key]=math.min(o.max,CONFIG[o.key]+st); vd.Text=tostring(CONFIG[o.key]); notify("Config",o.label..": "..CONFIG[o.key],Color3.fromRGB(150,150,150)) end)
			end
		end; return
	end
	if page.keymode == "ytradio" then
		local layout = Instance.new("UIListLayout", listFrame); layout.Padding = UDim.new(0,4)
		local h = Instance.new("TextLabel", listFrame); h.Size = UDim2.new(1,-6,0,26); h.BackgroundTransparency = 1; h.Text = "=== YT RADIO ==="; h.Font = Enum.Font.Code; h.TextSize = 10; h.TextColor3 = Color3.fromRGB(150,150,150); h.TextXAlignment = Enum.TextXAlignment.Left
		Instance.new("TextBox", listFrame).Size = UDim2.new(1,-6,0,28); Instance.new("TextBox", listFrame).BackgroundColor3 = Color3.fromRGB(20,20,20)
		local sl = Instance.new("TextLabel", listFrame); sl.Size = UDim2.new(1,-6,0,20); sl.BackgroundTransparency = 1; sl.Text = "Enter handle and LOAD."; sl.Font = Enum.Font.Code; sl.TextSize = 9; sl.TextColor3 = Color3.fromRGB(120,120,120); sl.TextXAlignment = Enum.TextXAlignment.Left
		return
	end
	local layout = Instance.new("UIListLayout", listFrame); layout.Padding = UDim.new(0,3); layout.SortOrder = Enum.SortOrder.LayoutOrder
	for _, d in ipairs(page.dances) do
		local entry = Instance.new("TextButton", listFrame); entry.Size = UDim2.new(1,-6,0,26); entry.BackgroundColor3 = Color3.fromRGB(25,25,25); entry.BorderSizePixel = 0
		Instance.new("UICorner", entry).CornerRadius = UDim.new(0,4); entry.Text = ""; entry.AutoButtonColor = false
		local badge = Instance.new("Frame", entry); badge.Size = UDim2.new(0,22,1,0); badge.BackgroundColor3 = Color3.fromRGB(d.gear and 70 or 50, d.gear and 50 or 50, d.gear and 0 or 50); badge.BorderSizePixel = 0
		Instance.new("UICorner", badge).CornerRadius = UDim.new(0,4)
		local badgeT = Instance.new("TextLabel", badge); badgeT.Size = UDim2.new(1,0,1,0); badgeT.BackgroundTransparency = 1
		badgeT.Text = d.gear and ("G"..d.gear) or d.key:upper(); badgeT.Font = Enum.Font.Code; badgeT.TextSize = 11; badgeT.TextColor3 = Color3.fromRGB(200,200,200)
		local nameL = Instance.new("TextLabel", entry); nameL.Position = UDim2.new(0,28,0,0); nameL.Size = UDim2.new(1,-28,1,0); nameL.BackgroundTransparency = 1
		nameL.Text = d.name .. (d.desc and ("  |  "..d.desc) or ""); nameL.Font = Enum.Font.Code; nameL.TextSize = 10; nameL.TextColor3 = d.gear and Color3.fromRGB(255,200,50) or Color3.fromRGB(180,180,180); nameL.TextXAlignment = Enum.TextXAlignment.Left
		entry.MouseEnter:Connect(function() entry.BackgroundColor3 = Color3.fromRGB(45,45,45) end)
		entry.MouseLeave:Connect(function() entry.BackgroundColor3 = Color3.fromRGB(25,25,25) end)
		entry.MouseButton1Click:Connect(function()
			if d.gear == 7 then currentGear = 7; notify("GEAR","Gear 7: Melee",Color3.fromRGB(255,200,50))
			elseif d.gear == 8 then currentGear = 8; notify("GEAR","Gear 8: Gun (plain)",Color3.fromRGB(255,200,50))
			elseif d.gear == 9 then currentGear = 9; notify("GEAR","Gear 9: Gun (effects)",Color3.fromRGB(200,100,255))
			elseif d.gear == 10 then currentGear = 10; physMode = 1; notify("GEAR","Gear 10: Physics Projectile",Color3.fromRGB(200,150,255))
			elseif d.id then
				if dancing then playAnother = true; task.wait(0.1) end
				currentGear = 0; notify("Dancer",d.name,Color3.fromRGB(100,200,255))
				task.spawn(loadAndPlay,d.id,d.sp or 1)
			end
		end)
	end
end

-- ── Input ──
UserInputService.InputBegan:Connect(function(ig, gp)
	if gp then return end
	if ig.UserInputType == Enum.UserInputType.MouseButton1 then
		if currentGear == 7 then meleeAttack()
		elseif currentGear >= 8 and currentGear <= 9 then gunFire()
		elseif currentGear == 10 then physFire() end
	end
end)

UserInputService.InputBegan:Connect(function(ig, gp)
	if gp then return end
	local k = string.lower(tostring(ig.KeyCode):gsub("Enum.KeyCode.",""))
	if k == "m" then
		currentPageIdx = (currentPageIdx % #pages) + 1
		local p = pages[currentPageIdx]; currentGear = 0
		notify("Dancer","Page: "..p.name,Color3.fromRGB(100,200,255))
		if getgenv().DancerMenu and getgenv().DancerMenu:FindFirstChild("ListFrame") then getgenv().DancerMenu.ListFrame:Destroy()
			buildList(getgenv().DancerMenu, getgenv().DancerMenu:FindFirstChild("Frame") or getgenv().DancerMenu) end
		return
	end
	if (k == "one" or k == "escape") and dancing then playAnother = true; task.wait(0.1); dancing = false; notify("Dancer","Stopped",Color3.fromRGB(200,200,200)); return end
	if k == "seven" or k == "7" then currentGear = 7; notify("GEAR","Gear 7: Melee",Color3.fromRGB(255,200,50)) end
	if k == "eight" or k == "8" then currentGear = 8; notify("GEAR","Gear 8: Gun (plain)",Color3.fromRGB(255,200,50)) end
	if k == "nine" or k == "9" then currentGear = 9; notify("GEAR","Gear 9: Gun (effects)",Color3.fromRGB(200,100,255)) end
	if k == "zero" or k == "0" then
		if currentGear == 10 then physMode = (physMode % 4) + 1; notify("GEAR 10",physNames[physMode],Color3.fromRGB(200,150,255))
		else currentGear = 10; physMode = 1; notify("GEAR","Gear 10: Physics Projectile",Color3.fromRGB(200,150,255)) end
	end
end)

-- ── Init ──
setupAllTools(); setupCharacter()
createMenu()
if CONFIG.destroyGrip then
	for _, v in ipairs(chr:GetDescendants()) do if v:IsA("Motor6D") and v.Name == "RightGrip" then v:Destroy() end end
	chr.DescendantAdded:Connect(function(obj) if CONFIG.destroyGrip and obj:IsA("Motor6D") and obj.Name == "RightGrip" then obj:Destroy() end end)
end
notify("System","Tool Dancer ready — 7=melee 8=gun 9=effects 0=phys",Color3.fromRGB(100,200,255))

-- ── Respawn ──
plr.CharacterAdded:Connect(function()
	getgenv().ToolDancerFE = false
	if getgenv().DancerMenu then getgenv().DancerMenu:Destroy() end
	for _, ft in ipairs(feTools) do
		if ft.align and ft.align.Parent then ft.align:Destroy() end; if ft.angular and ft.angular.Parent then ft.angular:Destroy() end; if ft.refPart and ft.refPart.Parent then ft.refPart:Destroy() end
	end
	table.clear(feTools); table.clear(refParts)
	if camPart and camPart.Parent then camPart:Destroy() end
end)
