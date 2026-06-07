Config = {}

-- Command to open the item creator UI
Config.Command = 'itemcreator'

-- Ace permission required to use the item creator (set to nil to allow everyone)
Config.Permission = 'oxitemreg.use'

-- Where items are saved on disk (relative to server-data or txData)
-- Items are written to ox_inventory's items folder
Config.OxInventoryItemsPath = '../../ox_inventory/data/items.lua'

-- Fallback path if ox_inventory isn't found at the relative location
Config.FallbackItemsPath = 'data/items.lua'

-- Whether to require ox_inventory to be running
Config.RequireOxInventory = true
