fx_version 'cerulean'
game 'gta5'

name 'oxitemreg'
description 'ox_inventory custom item registry GUI'
version '1.0.0'
author 'oxitemreg'

shared_scripts {
    'shared/config.lua',
}

server_scripts {
    'server/main.lua',
}

client_scripts {
    'client/main.lua',
}

ui_page 'web/index.html'

files {
    'web/index.html',
    'web/style.css',
    'web/app.js',
    'web/images/*.png',
}
