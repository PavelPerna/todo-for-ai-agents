import zipfile, os, json
E='.'; v=json.load(open('package.json'))['version']; out=f'claude-todo-view-{v}.vsix'
manifest=f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata><Identity Language="en-US" Id="claude-todo-view" Version="{v}" Publisher="pavel-local"/><DisplayName>Claude TODO</DisplayName>
  <Description xml:space="preserve">Live todo lists from .todo written by Claude Code</Description>
  <Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.90.0"/><Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/></Properties></Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
  <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets>
</PackageManifest>'''
ct='''<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Default Extension=".json" ContentType="application/json"/><Default Extension=".js" ContentType="application/javascript"/><Default Extension=".vsixmanifest" ContentType="text/xml"/></Types>'''
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('extension.vsixmanifest',manifest); z.writestr('[Content_Types].xml',ct)
    for f in ('package.json','extension.js'): z.write(os.path.join(E,f),'extension/'+f)
print(out)
