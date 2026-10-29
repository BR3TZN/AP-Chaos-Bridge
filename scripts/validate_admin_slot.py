"""Generate a real three-slot seed with pinned official Core and test the Bridge.

Developer/CI only: executes the explicitly pinned Archipelago sources, never
uploaded APworld code. The seed, server and game clients are temporary and local.
"""
import argparse
import asyncio
import functools
import importlib
import json
import os
import shutil
import tempfile
from pathlib import Path
from core_worlds import ROOT, load_core

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--archipelago', type=Path, required=True)
args = parser.parse_args()
spec, world_types = load_core(args.archipelago)
importlib.import_module('worlds.generic')
import worlds
worlds.network_data_package = {'games': {name: world.get_data_package_data() for name, world in world_types.items()}}
import Generate
import Main
import MultiServer
import Utils
from NetUtils import SlotType
import websockets


async def check_server(archive, admin_slot):
    ctx = MultiServer.Context(host='127.0.0.1', port=0, password='smoke-room', server_password='smoke-admin',
                              location_check_points=1, hint_cost=10, item_cheat=False)
    ctx.load(str(archive))
    assert ctx.slot_info[admin_slot].type == SlotType.spectator
    assert ctx.connect_names['ADMIN'] == (0, admin_slot)
    async with websockets.serve(functools.partial(MultiServer.server, ctx=ctx), '127.0.0.1', 0) as server:
        address = 'ws://127.0.0.1:' + str(server.sockets[0].getsockname()[1])
        process = await asyncio.create_subprocess_exec('node', str(ROOT / 'scripts/admin-slot-smoke.mjs'), address,
                                                       stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=45)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            raise
        if process.returncode:
            raise RuntimeError(stdout.decode() + stderr.decode())
        print(stdout.decode().strip())


with tempfile.TemporaryDirectory(prefix='ap-admin-seed-') as temporary:
    directory = Path(temporary)
    os.chdir(directory)
    Utils.user_path.cached_path = str(directory)
    players = directory / 'players'
    players.mkdir()
    shutil.copyfile(ROOT / 'examples/ADMIN.yaml', players / 'ADMIN.yaml')
    for name in ['Daniel', 'Friend']:
        (players / (name + '.yaml')).write_text('name: ' + name + '\ngame: ChecksFinder\nChecksFinder: {}\n', encoding='utf-8')
    options = Generate.mystery_argparse(['--player_files_path', str(players), '--weights_file_path', 'unused-weights.yaml', '--meta_file_path', 'unused-meta.yaml',
                                        '--multi', '3', '--seed', '12345', '--spoiler', '0', '--outputpath', str(directory / 'output')])
    rolled, seed = Generate.main(options)
    multiworld = Main.main(rolled, seed, baked_server_options={'server_password': 'smoke-admin'})
    admin_slot = next(slot for slot, name in multiworld.player_name.items() if name == 'ADMIN')
    assert multiworld.player_types[admin_slot] == SlotType.spectator
    assert not multiworld.get_locations(admin_slot)
    assert not any(location.item.player == admin_slot for location in multiworld.get_filled_locations())
    archive, = (directory / 'output').glob('*.zip')
    asyncio.run(check_server(archive, admin_slot))
    print(json.dumps({'archipelagoVersion': spec['version'], 'seedGenerated': True, 'players': 2,
                      'dummy': 'ADMIN', 'spectator': True, 'dummyLocations': 0, 'dummyItems': 0}))
