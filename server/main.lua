local registeredItems = {}
local oxItems         = {}
local imageCache      = {}

local START_MARKER = '    -- [OXITEMREG_START]'
local END_MARKER   = '    -- [OXITEMREG_END]'

-- ─── Helpers ──────────────────────────────────────────────────────────────────

local function saveRegisteredItems()
    SetResourceKvp('registered_items', json.encode(registeredItems))
end

local function loadRegisteredItems()
    local raw = GetResourceKvpString('registered_items')
    if raw and raw ~= '' then
        local ok, decoded = pcall(json.decode, raw)
        if ok and type(decoded) == 'table' then
            registeredItems = decoded
        end
    end
end

local function fetchOxItems()
    local ok, items = pcall(function() return exports.ox_inventory:Items() end)
    if not ok or type(items) ~= 'table' then
        print('^1[oxitemreg] Could not read ox_inventory items.^7')
        return {}
    end
    return items
end

-- ─── File-based persistence (writes into ox_inventory/data/items.lua) ────────

local function escLua(s)
    return tostring(s or ''):gsub('\\', '\\\\'):gsub("'", "\\'"):gsub('\n', ' ')
end

---Build the Lua lines that represent our items section inside items.lua
local function buildItemsSection()
    if #registeredItems == 0 then
        return START_MARKER .. '\n' .. END_MARKER
    end
    local lines = { START_MARKER }
    for _, item in ipairs(registeredItems) do
        local desc = item.description and ("'" .. escLua(item.description) .. "'") or 'nil'
        lines[#lines + 1] = string.format(
            "    ['%s'] = { label = '%s', weight = %d, stack = %s, close = %s, consume = %d, description = %s, client = { image = '%s' } },",
            escLua(item.name),
            escLua(item.label or item.name),
            tonumber(item.weight) or 100,
            item.stack ~= false and 'true' or 'false',
            item.close ~= false and 'true' or 'false',
            item.consume and 1 or 0,
            desc,
            escLua(item.name)
        )
    end
    lines[#lines + 1] = END_MARKER
    return table.concat(lines, '\n')
end

---Write our items into ox_inventory/data/items.lua.
-- If our section already exists it is replaced; otherwise it is inserted
-- just before the closing `}` of the return table.
-- Returns true on success, or false + message on failure.
local function writeItemsToFile()
    local content = LoadResourceFile('ox_inventory', 'data/items.lua')
    if not content then
        return false, 'Could not read ox_inventory/data/items.lua – is ox_inventory running and does the file exist?'
    end

    local section = buildItemsSection()

    -- Replace existing section if present
    local sStart = content:find(START_MARKER, 1, true)
    local sEnd   = sStart and content:find(END_MARKER, sStart, true)
    if sStart and sEnd then
        content = content:sub(1, sStart - 1) .. section .. content:sub(sEnd + #END_MARKER)
    else
        -- Insert before the very last `}` in the file (closing brace of return table)
        local insertAt = nil
        for pos = #content, 1, -1 do
            local ch = content:sub(pos, pos)
            if ch == '}' then insertAt = pos; break end
        end
        if not insertAt then
            return false, 'Could not find insertion point in items.lua'
        end
        content = content:sub(1, insertAt - 1) .. '\n' .. section .. '\n' .. content:sub(insertAt)
    end

    local ok = SaveResourceFile('ox_inventory', 'data/items.lua', content, -1)
    if not ok then
        return false, 'SaveResourceFile failed – check server file permissions'
    end

    return true, nil
end

-- ─── Startup ─────────────────────────────────────────────────────────────────

AddEventHandler('onResourceStart', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    loadRegisteredItems()
    -- Delay slightly so ox_inventory finishes its own startup first
    Citizen.SetTimeout(500, function()
        oxItems = fetchOxItems()
        print('^2[oxitemreg] Started. ' .. #registeredItems .. ' custom item(s) loaded from KV.^7')

        if #registeredItems > 0 then
            -- Write to ox_inventory's items file so they survive restarts
            local ok, err = writeItemsToFile()
            if ok then
                print('^2[oxitemreg] Items written to ox_inventory/data/items.lua.^7')
            else
                print('^3[oxitemreg] Warning – could not write to items.lua: ' .. tostring(err) .. '^7')
                print('^3[oxitemreg] Items will NOT persist across restarts until this is resolved.^7')
            end
        end
    end)
end)

-- ─── NUI Callbacks ───────────────────────────────────────────────────────────

RegisterNetEvent('oxitemreg:getState', function()
    local src = source
    oxItems = fetchOxItems()

    local oxList = {}
    for name, data in pairs(oxItems) do
        oxList[#oxList + 1] = {
            name        = name,
            label       = data.label or name,
            weight      = data.weight or 0,
            stack       = data.stack ~= false,
            close       = data.close ~= false,
            consume     = data.consume and data.consume > 0 or false,
            description = data.description,
            image       = data.client and data.client.image or nil,
            sensitive   = data.client and (data.client.usetime or data.client.anim) and true or false,
        }
    end

    TriggerClientEvent('oxitemreg:stateResponse', src, {
        myItems = registeredItems,
        oxItems = oxList,
    })
end)

RegisterNetEvent('oxitemreg:addItem', function(item)
    local src = source
    if not item or type(item) ~= 'table' then return end

    item.name   = tostring(item.name):lower():gsub('%s+', '_')
    item.weight = tonumber(item.weight) or 100
    item.label  = tostring(item.label or item.name)
    item.stack  = item.stack ~= false
    item.close  = item.close ~= false
    item.consume = item.consume == true

    if item.name == '' then
        TriggerClientEvent('oxitemreg:addItemResponse', src, false, 'Item name cannot be empty.')
        return
    end
    for _, v in ipairs(registeredItems) do
        if v.name == item.name then
            TriggerClientEvent('oxitemreg:addItemResponse', src, false, 'An item with that name already exists in your registry.')
            return
        end
    end

    registeredItems[#registeredItems + 1] = item
    saveRegisteredItems()
    TriggerClientEvent('oxitemreg:addItemResponse', src, true, item)
end)

RegisterNetEvent('oxitemreg:editItem', function(itemName, updates)
    local src = source
    for i, v in ipairs(registeredItems) do
        if v.name == itemName then
            for k, val in pairs(updates) do registeredItems[i][k] = val end
            saveRegisteredItems()
            TriggerClientEvent('oxitemreg:editItemResponse', src, true, registeredItems[i])
            return
        end
    end
    TriggerClientEvent('oxitemreg:editItemResponse', src, false, 'Item not found.')
end)

RegisterNetEvent('oxitemreg:deleteItems', function(names)
    local src = source
    if type(names) ~= 'table' then return end
    local nameSet = {}
    for _, n in ipairs(names) do nameSet[n] = true end
    local kept = {}
    for _, v in ipairs(registeredItems) do
        if not nameSet[v.name] then kept[#kept + 1] = v end
    end
    registeredItems = kept
    saveRegisteredItems()
    TriggerClientEvent('oxitemreg:deleteItemsResponse', src, true)
end)

RegisterNetEvent('oxitemreg:applyItems', function()
    local src = source

    -- Write items to ox_inventory's items.lua for permanent storage
    local writeOk, writeErr = writeItemsToFile()

    if writeOk then
        print('^2[oxitemreg] Applied ' .. #registeredItems .. ' item(s) to ox_inventory/data/items.lua^7')
        -- Restart ox_inventory so it picks up the new items immediately
        ExecuteCommand('restart ox_inventory')
        TriggerClientEvent('oxitemreg:applyResponse', src, #registeredItems, 0, true)
    else
        print('^1[oxitemreg] Apply failed: ' .. tostring(writeErr) .. '^7')
        TriggerClientEvent('oxitemreg:applyResponse', src, 0, #registeredItems, false, writeErr)
    end
end)

RegisterNetEvent('oxitemreg:cacheImage', function(url)
    local src = source
    if imageCache[url] then
        TriggerClientEvent('oxitemreg:imageCached', src, url, imageCache[url])
        return
    end
    PerformHttpRequest(url, function(status, body, headers)
        if status == 200 and body then
            local ct = (headers and (headers['Content-Type'] or headers['content-type'])) or 'image/png'
            local b64 = 'data:' .. ct .. ';base64,' .. body
            imageCache[url] = b64
            TriggerClientEvent('oxitemreg:imageCached', src, url, b64)
        end
    end, 'GET', '', { ['Accept'] = 'image/*' })
end)

-- ─── Commands ────────────────────────────────────────────────────────────────

RegisterCommand(Config.Command, function(src)
    if src == 0 then return end
    if Config.Permission and not IsPlayerAceAllowed(src, Config.Permission) then
        TriggerClientEvent('chat:addMessage', src, {
            color = { 255, 50, 50 },
            args  = { 'System', 'You do not have permission to use the item creator.' },
        })
        return
    end
    TriggerClientEvent('oxitemreg:openUI', src)
end, false)

if Config.Permission then
    ExecuteCommand('add_ace group.admin ' .. Config.Permission .. ' allow')
end
