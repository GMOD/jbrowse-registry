from github import Github
import os
import json
import yaml
import subprocess
import logging
gh = Github(
    login_or_token=os.environ.get('GITHUB_USERNAME', None) or os.environ.get('GITHUB_OAUTH_TOKEN', None),
    password=os.environ.get('GITHUB_PASSWORD', None),
)
logging.warn("GH API RATE LIMIT: %s/%s" % gh.rate_limiting)

with open('plugins.yaml', 'r') as handle:
    plugins = yaml.load(handle)

# wipe out existing jbrowse-themes plugins
plugins = [plugin for plugin in plugins if 'github.com/jbrowse-themes/' not in plugin['location']]

org = gh.get_organization('jbrowse-themes')
for repo in org.get_repos():
    plugins.append({
        'author': 'JBrowse Themes',
        'description': repo.description,
        'name': repo.name,
        'image': '%s.png' % repo.name,
        'license': 'GPL-3.0', # hard coded for now
        'location': repo.html_url,
        'demo': "%s&tracks=DNA,ExampleFeatures&loc=ctgA:1..6268" % repo.name,
        'gmodProject': 'JBrowse',
    })

    subprocess.check_call([
        'wget', repo.get_contents('/img/screenshot.png').raw_data['download_url'],
        '-O', 'img/%s.png' % repo.name
    ])

    loc = [x for x in repo.get_git_refs() if x.ref == 'refs/heads/master'][0]
    commit = loc.object.sha
    demoDir = 'demos/%s/trackList.json' % repo.name

    if not os.path.exists(demoDir):
        subprocess.check_call([
            'cp', '-Rv', 'demos/_theme-base',
            'demos/%s' % repo.name,
        ])
        with open(demoDir, 'r') as handle:
            demoTrackList = json.load(handle)
            demoTrackList['plugins'] = [
                {
                    'name': repo.name,
                    'location': 'https://cdn.rawgit.com/jbrowse-themes/%s/%s' % (repo.name, commit)
                }
            ]
        with open(demoDir, 'w') as handle:
            json.dump(demoTrackList, handle, indent=2)
    else:
        print 'Demo not updated. demos/%s/trackList.json => %s' % (repo.name, commit)

with open('plugins.yaml', 'w') as handle:
    yaml.safe_dump(plugins, handle, default_flow_style=False, encoding='utf-8', allow_unicode=True)
