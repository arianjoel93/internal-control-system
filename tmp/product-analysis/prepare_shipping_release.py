from pathlib import Path
import subprocess,zipfile,shutil
root=Path.cwd()
target=root/'tmp'/'shipping-release'
if target.exists():raise SystemExit('Release directory exists; inspect before replacing')
target.mkdir(parents=True)
archive=root/'tmp'/'shipping-base.zip'
subprocess.run(['git','archive','--format=zip','-o',str(archive),'HEAD'],check=True)
with zipfile.ZipFile(archive) as z:z.extractall(target)
for relative in ['src/features/shipping','supabase/functions/shipping-quote','supabase/functions/_shared/shipping-packing.ts','supabase/functions/_shared/shipping-catalog.ts']:
    source=root/relative
    if source.is_dir():shutil.copytree(source,target/relative,dirs_exist_ok=True)
    else:shutil.copy2(source,target/relative)
typepath=target/'src/lib/types.ts'
types=typepath.read_text(encoding='utf8')
start=types.index('export type ShippingProductDimension = {')
end=types.index('\n};',start)+3
current=(root/'src/lib/types.ts').read_text(encoding='utf8')
a=current.index('export type ShippingProductDimension = {');b=current.index('\n};',a)+3
typepath.write_text(types[:start]+current[a:b]+types[end:],encoding='utf8')
envlines=(root/'.env.local').read_text(encoding='utf8').splitlines()
public=[line for line in envlines if line.split('=',1)[0].strip() in ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','VITE_SUPABASE_ANON_KEY']]
(target/'.env.production.local').write_text('\n'.join(public)+'\n',encoding='utf8')
subprocess.run(['cmd','/c','mklink','/J',str(target/'node_modules'),str(root/'node_modules')],check=True,capture_output=True)
print('Isolated shipping release prepared at',target)
