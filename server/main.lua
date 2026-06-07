local registeredItems = {}      -- items created through this resource
local oxItems = {}              -- items read from ox_inventory at runtime
local imageCache = {}           -- base64 cached images keyed by url

---Read all items currently registered in ox_inventory via exports
local function fetchOxItems()
    if not Config.RequireOxInventory then return {} end
    local ok, items = pcall(function()
        return exports.ox_inventory:Items()
    end)
    if not ok or type(items) ~= 'table' then
        print('^1[oxitemreg] Could not read ox_inventory items. Is ox_inventory running?^7')
        return {}
    end
    return items
end

---Persist registeredItems to the resource's KV store so they survive restarts
local function saveRegisteredItems()
    local encoded = json.encode(registeredItems)
    SetResourceKvp('registered_items', encoded)
end

---Load persisted items on startup
local function loadRegisteredItems()
    local raw = GetResourceKvpString('registered_items')
    if raw and raw ~= '' then
        local ok, decoded = pcall(json.decode, raw)
        if ok and type(decoded) == 'table' then
            registeredItems = decoded
        end
    end
end

---Register or update an item in ox_inventory at runtime.
-- ox_inventory has no RegisterItem export. Instead, Items() returns a reference
-- to the internal items table, so writing into it registers the item immediately.
local function applyItemToOxInventory(item)
    local ok, err = pcall(function()
        local items = exports.ox_inventory:Items()
        if type(items) ~= 'table' then
            error('ox_inventory:Items() did not return a table')
        end
        items[item.name] = {
            name        = item.name,
            label       = item.label or item.name,
            weight      = item.weight or 100,
            stack       = item.stack ~= false,
            close       = item.close ~= false,
            consume     = item.consume and 1 or 0,
            description = item.description or nil,
            client      = { image = item.name },
            buttons     = {},
        }
    end)
    if not ok then
        print('^1[oxitemreg] Failed to inject item "' .. tostring(item.name) .. '": ' .. tostring(err) .. '^7')
    end
    return ok
end

---Download and cache an image from a URL, returns base64 string
local function cacheImage(url, cb)
    if imageCache[url] then
        return cb(imageCache[url])
    end
    PerformHttpRequest(url, function(status, body, headers)
        if status == 200 and body then
            local ct = headers and (headers['Content-Type'] or headers['content-type']) or 'image/png'
            local b64 = 'data:' .. ct .. ';base64,' .. body
            imageCache[url] = b64
            cb(b64)
        else
            cb(nil)
        end
    end, 'GET', '', { ['Accept'] = 'image/*' })
end

AddEventHandler('onResourceStart', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    loadRegisteredItems()
    oxItems = fetchOxItems()
    print('^2[oxitemreg] Started. ' .. #registeredItems .. ' custom item(s) loaded.^7')
end)

-- ─── NUI Callbacks ───────────────────────────────────────────────────────────

RegisterNetEvent('oxitemreg:getState', function()
    local src = source
    -- Refresh ox items
    oxItems = fetchOxItems()

    -- Build ox item list for UI
    local oxList = {}
    for name, data in pairs(oxItems) do
        oxList[#oxList + 1] = {
            name   = name,
            label  = data.label or name,
            weight = data.weight or 0,
            stack  = data.stack ~= false,
            close  = data.close ~= false,
            consume = data.consume and data.consume > 0 or false,
            description = data.description,
            image  = data.client and data.client.image or nil,
            sensitive = data.client and (data.client.usetime or data.client.anim) and true or false,
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

    -- Basic sanitise
    item.name = tostring(item.name):lower():gsub('%s+', '_')
    if item.name == '' then
        TriggerClientEvent('oxitemreg:addItemResponse', src, false, 'Item name cannot be empty.')
        return
    end
    item.weight  = tonumber(item.weight) or 100
    item.label   = tostring(item.label or item.name)
    item.stack   = item.stack ~= false
    item.close   = item.close ~= false
    item.consume = item.consume == true

    -- Check duplicate in custom items
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
            for k, val in pairs(updates) do
                registeredItems[i][k] = val
            end
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
        if not nameSet[v.name] then
            kept[#kept + 1] = v
        end
    end
    registeredItems = kept
    saveRegisteredItems()
    TriggerClientEvent('oxitemreg:deleteItemsResponse', src, true)
end)

RegisterNetEvent('oxitemreg:applyItems', function()
    local src = source
    local applied, failed = 0, 0
    for _, item in ipairs(registeredItems) do
        local ok = applyItemToOxInventory(item)
        if ok then applied = applied + 1 else failed = failed + 1 end
    end
    TriggerClientEvent('oxitemreg:applyResponse', src, applied, failed)
end)

RegisterNetEvent('oxitemreg:cacheImage', function(url)
    local src = source
    cacheImage(url, function(b64)
        TriggerClientEvent('oxitemreg:imageCached', src, url, b64)
    end)
end)

-- ─── Commands ────────────────────────────────────────────────────────────────

RegisterCommand(Config.Command, function(src, args)
    if src == 0 then return end  -- server console
    if Config.Permission and not IsPlayerAceAllowed(src, Config.Permission) then
        TriggerClientEvent('chat:addMessage', src, {
            color = { 255, 50, 50 },
            multiline = false,
            args = { 'System', 'You do not have permission to use the item creator.' },
        })
        return
    end
    TriggerClientEvent('oxitemreg:openUI', src)
end, false)

if Config.Permission then
    ExecuteCommand('add_ace group.admin ' .. Config.Permission .. ' allow')
end
