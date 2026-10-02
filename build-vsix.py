import zipfile, os, json, html
j = json.load(open('package.json')); v = j['version']; name = j['name']; pub = j['publisher']
out = f'{name}-{v}.vsix'
repo = j['repository']['url'].removesuffix('.git')
manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="{name}" Version="{v}" Publisher="{pub}"/>
    <DisplayName>{html.escape(j['displayName'])}</DisplayName>
    <Description xml:space="preserve">{html.escape(j['description'])}</Description>
    <Tags>{','.join(j['keywords'])}</Tags>
    <Categories>{','.join(j['categories'])}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="{j['engines']['vscode']}"/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/>
      <Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value=""/>
      <Property Id="Microsoft.VisualStudio.Services.Links.Source" Value="{repo}"/>
      <Property Id="Microsoft.VisualStudio.Services.Links.Getstarted" Value="{repo}"/>
      <Property Id="Microsoft.VisualStudio.Services.Links.GitHub" Value="{repo}"/>
      <Property Id="Microsoft.VisualStudio.Services.Links.Support" Value="{j['bugs']['url']}"/>
      <Property Id="Microsoft.VisualStudio.Services.Links.Learn" Value="{j['homepage']}"/>
      <Property Id="Microsoft.VisualStudio.Services.GitHubFlavoredMarkdown" Value="true"/>
      <Property Id="Microsoft.VisualStudio.Services.Content.Pricing" Value="Free"/>
    </Properties>
    <License>extension/LICENSE</License>
    <Icon>extension/icon.png</Icon>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.Changelog" Path="extension/CHANGELOG.md" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/icon.png" Addressable="true"/>
  </Assets>
</PackageManifest>'''
ct = '''<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Default Extension=".json" ContentType="application/json"/><Default Extension=".js" ContentType="application/javascript"/><Default Extension=".vsixmanifest" ContentType="text/xml"/><Default Extension=".md" ContentType="text/markdown"/><Default Extension=".png" ContentType="image/png"/><Default Extension="" ContentType="text/plain"/></Types>'''
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('extension.vsixmanifest', manifest); z.writestr('[Content_Types].xml', ct)
    for f in ('package.json', 'extension.js', 'lib.js', 'i18n.js', 'README.md', 'CHANGELOG.md', 'LICENSE', 'icon.png'):
        z.write(f, 'extension/' + f)
print(out)
