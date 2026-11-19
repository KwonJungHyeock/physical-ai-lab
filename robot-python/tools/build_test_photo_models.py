# 1장 수행평가 사진용 로봇 6종: 공개 로봇 설명 파일(URDF · MJCF)을 한 자세로 조립해 GLB 하나로 (Z 위, m)
# python3 build_glb.py <dl 폴더> <출력 폴더>
import math, os, sys
import xml.etree.ElementTree as ET
import numpy as np
import trimesh
from trimesh.transformations import quaternion_matrix, rotation_matrix, translation_matrix, euler_matrix

DL, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)


def fl(s, n=3, d=0.0):
    return [float(v) for v in s.split()] if s else [d] * n


def load_mesh(path, scale=(1, 1, 1)):
    m = trimesh.load(path, force='mesh', process=False)
    # (some COLLADA files are in mm and say so in their header, which this loader skips: a part over 5 m is mm)
    if path.lower().endswith('.dae') and m.extents is not None and max(m.extents) > 5:
        m.apply_scale(0.001)
    m.apply_scale(scale)
    return m


# ---------- MJCF ----------
def mjcf(xml_path, pose=None, key=None):
    root = ET.parse(xml_path).getroot()
    base = os.path.dirname(xml_path)
    comp = root.find('compiler')
    mdir = ''
    if comp is not None:
        mdir = comp.get('meshdir') or comp.get('assetdir') or ''
    # class defaults: geom / mesh attributes, with inheritance
    defaults = {}

    def walk_default(el, parent):
        name = el.get('class', 'main')
        d = {'geom': dict(parent['geom']), 'mesh': dict(parent['mesh'])}
        for tag in ('geom', 'mesh'):
            e = el.find(tag)
            if e is not None:
                d[tag].update(e.attrib)
        defaults[name] = d
        for c in el.findall('default'):
            walk_default(c, d)

    for top in root.findall('default'):
        walk_default(top, {'geom': {}, 'mesh': {}})
    meshes = {}
    for a in root.iter('asset'):
        for m in a.findall('mesh'):
            cls = defaults.get(m.get('class', 'main'), {'mesh': {}})['mesh']
            f = m.get('file')
            name = m.get('name') or os.path.splitext(os.path.basename(f))[0]
            sc = fl(m.get('scale') or cls.get('scale') or '1 1 1')
            mp = os.path.join(base, mdir, f)
            if not os.path.exists(mp):  # (Doosan: paths from the folder above)
                mp = os.path.join(os.path.dirname(base), mdir, f)
            meshes[name] = (mp, sc)
    q = {}
    if key:
        k = root.find(f".//keyframe/key[@name='{key}']")
        vals = fl(k.get('qpos'))
        i = 0
        # order of qpos: joints in tree order (the bodies only, not the defaults); a freejoint takes 7
        order = []
        for el in root.find('worldbody').iter():
            if el.tag == 'freejoint':
                order.append(('free', 7))
            elif el.tag == 'joint' and el.get('type', 'hinge') == 'hinge':
                order.append((el.get('name'), 1))
        for nm, w in order:
            if nm != 'free':
                q[nm] = vals[i]
            i += w
    if pose:
        q.update(pose)
    scene = []

    def body(el, T, cls):
        cls = el.get('childclass', cls)
        pos = fl(el.get('pos'))
        qq = fl(el.get('quat'), 4) if el.get('quat') else [1, 0, 0, 0]
        T = T @ translation_matrix(pos) @ quaternion_matrix(qq)
        for j in el.findall('joint'):
            if j.get('name') in q and j.get('type', 'hinge') == 'hinge':
                ax = fl(j.get('axis') or '0 0 1')
                jp = fl(j.get('pos'))
                T = T @ translation_matrix(jp) @ rotation_matrix(q[j.get('name')], ax) @ translation_matrix([-v for v in jp])
        for g in el.findall('geom'):
            gcls = g.get('class', cls)
            dg = dict(defaults.get(gcls, {'geom': {}})['geom'])
            dg.update(g.attrib)
            if dg.get('type', 'sphere') != 'mesh' or dg.get('group') == '3' or dg.get('material') == 'invisible' or 'collision' in gcls:
                continue
            mp, sc = meshes[dg['mesh']]
            m = load_mesh(mp, sc)
            G = T @ translation_matrix(fl(dg.get('pos'))) @ quaternion_matrix(fl(dg.get('quat'), 4) if dg.get('quat') else [1, 0, 0, 0])
            m.apply_transform(G)
            scene.append(m)
        for b in el.findall('body'):
            body(b, T, cls)

    wb = root.find('worldbody')
    body(wb, np.eye(4), 'main')
    return scene


# ---------- URDF ----------
def urdf(path, pkg, q):
    root = ET.parse(path).getroot()
    links = {l.get('name'): l for l in root.findall('link')}
    children = {}
    for j in root.findall('joint'):
        children.setdefault(j.find('parent').get('link'), []).append(j)
    kids = {j.find('child').get('link') for j in root.findall('joint')}
    rootlink = [n for n in links if n not in kids][0]
    scene = []

    def origin(el):
        o = el.find('origin') if el is not None else None
        xyz = fl(o.get('xyz')) if o is not None and o.get('xyz') else [0, 0, 0]
        rpy = fl(o.get('rpy')) if o is not None and o.get('rpy') else [0, 0, 0]
        return translation_matrix(xyz) @ euler_matrix(*rpy, 'sxyz')

    def link(name, T):
        for v in links[name].findall('visual'):
            m = v.find('geometry/mesh')
            if m is None:
                continue
            f = m.get('filename')
            for k, d in pkg.items():
                f = f.replace(k, d)
            mesh = load_mesh(f, fl(m.get('scale') or '1 1 1'))
            mesh.apply_transform(T @ origin(v))
            scene.append(mesh)
        for j in children.get(name, []):
            Tj = T @ origin(j)
            if j.get('type') in ('revolute', 'continuous') and j.get('name') in q:
                ax = fl(j.find('axis').get('xyz')) if j.find('axis') is not None else [1, 0, 0]
                Tj = Tj @ rotation_matrix(q[j.get('name')], ax)
            link(j.find('child').get('link'), Tj)

    link(rootlink, np.eye(4))
    return scene


def save(name, parts):
    s = trimesh.Scene()
    for i, m in enumerate(parts):
        s.add_geometry(m, node_name=f'{name}_{i}')
    b = s.bounds
    print(name, len(parts), 'parts, size (mm)', np.round((b[1] - b[0]) * 1000).astype(int).tolist())
    s.export(os.path.join(OUT, f'{name}.glb'))


d = math.radians
only = set(sys.argv[3].split(',')) if len(sys.argv) > 3 else None
want = lambda n: not only or n in only

if want('drone'):
    save('drone', mjcf(os.path.join(DL, 'menagerie/skydio_x2/x2.xml')))
if want('quadruped'):
    # ANYmal C (no lettering on the body; Go2 has its name embossed on top)
    save('quadruped', mjcf(os.path.join(DL, 'menagerie/anybotics_anymal_c/anymal_c_mjx.xml'), key='standing'))
if want('doosan'):
    save('doosan', mjcf(os.path.join(DL, 'doosan/dsr_description2/mujoco_models/a0509.xml') if False else os.path.join(DL, 'doosan/dsr_description2/mujoco_models/a0509/a0509.xml'),
                        pose={'joint_1': 0, 'joint_2': d(-25), 'joint_3': d(105), 'joint_4': 0, 'joint_5': d(75), 'joint_6': 0}))
if want('rainbow'):
    save('rainbow', urdf(os.path.join(DL, 'rbpodo/rbpodo_description/robots/rb5_850e_u.urdf'), {'package://rbpodo_description/': os.path.join(DL, 'rbpodo/rbpodo_description') + '/'},
                         {'base': 0, 'shoulder': d(-25), 'elbow': d(105), 'wrist1': d(-80), 'wrist2': d(90), 'wrist3': 0}))
if want('mycobot'):
    save('mycobot', urdf('/home/user/physical-ai-lab/web-typescript/public/robot/rdkx5/mycobot_280_rdkx5.urdf', {'package://mycobot_description/': os.path.join(DL, 'mycobot/mycobot_description') + '/'},
                         {'joint2_to_joint1': d(0.61), 'joint3_to_joint2': d(45.87), 'joint4_to_joint3': d(-92.37), 'joint5_to_joint4': d(-41.3), 'joint6_to_joint5': d(2.02), 'joint6output_to_joint6': d(9.58)}))
