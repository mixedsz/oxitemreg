local uiOpen = false

local function setUIOpen(state)
    uiOpen = state
    SetNuiFocus(state, state)
    SendNUIMessage({ type = 'setVisible', visible = state })
end

-- ─── Open / Close ────────────────────────────────────────────────────────────

RegisterNetEvent('oxitemreg:openUI', function()
    if uiOpen then return end
    setUIOpen(true)
    TriggerServerEvent('oxitemreg:getState')
end)

RegisterNetEvent('oxitemreg:stateResponse', function(state)
    SendNUIMessage({ type = 'stateResponse', data = state })
end)

-- ─── Item CRUD responses ──────────────────────────────────────────────────────

RegisterNetEvent('oxitemreg:addItemResponse', function(success, data)
    SendNUIMessage({ type = 'addItemResponse', success = success, data = data })
end)

RegisterNetEvent('oxitemreg:editItemResponse', function(success, data)
    SendNUIMessage({ type = 'editItemResponse', success = success, data = data })
end)

RegisterNetEvent('oxitemreg:deleteItemsResponse', function(success)
    SendNUIMessage({ type = 'deleteItemsResponse', success = success })
end)

RegisterNetEvent('oxitemreg:applyResponse', function(applied, failed)
    SendNUIMessage({ type = 'applyResponse', applied = applied, failed = failed })
    TriggerServerEvent('oxitemreg:getState')
end)

RegisterNetEvent('oxitemreg:imageCached', function(url, b64)
    SendNUIMessage({ type = 'imageCached', url = url, b64 = b64 })
end)

-- ─── NUI Callbacks ────────────────────────────────────────────────────────────

RegisterNUICallback('close', function(_, cb)
    setUIOpen(false)
    cb('ok')
end)

RegisterNUICallback('getState', function(_, cb)
    TriggerServerEvent('oxitemreg:getState')
    cb('ok')
end)

RegisterNUICallback('addItem', function(data, cb)
    TriggerServerEvent('oxitemreg:addItem', data)
    cb('ok')
end)

RegisterNUICallback('editItem', function(data, cb)
    TriggerServerEvent('oxitemreg:editItem', data.name, data.updates)
    cb('ok')
end)

RegisterNUICallback('deleteItems', function(data, cb)
    TriggerServerEvent('oxitemreg:deleteItems', data.names)
    cb('ok')
end)

RegisterNUICallback('applyItems', function(_, cb)
    TriggerServerEvent('oxitemreg:applyItems')
    cb('ok')
end)

RegisterNUICallback('cacheImage', function(data, cb)
    TriggerServerEvent('oxitemreg:cacheImage', data.url)
    cb('ok')
end)

-- Close on Escape
Citizen.CreateThread(function()
    while true do
        Citizen.Wait(0)
        if uiOpen and IsControlJustReleased(0, 200) then
            setUIOpen(false)
        end
    end
end)
