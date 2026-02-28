import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import * as XLSX from 'xlsx';

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<any>(null);
  const [error, setError] = useState('');

  // 👇 CAMBIA ESTO POR TU CORREO REAL DE ACCESO 👇
  const correoAdmin = 'admin@comisiones.com'; 

  const [vista, setVista] = useState('buscador');
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  const [mensajeCarga, setMensajeCarga] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    supabase.auth.onAuthStateChange((_event, session) => setSession(session));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError('Credenciales incorrectas.');
  };

  const handleLogout = async () => { await supabase.auth.signOut(); };

  const manejarBusqueda = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value;
    setBusqueda(valor);
    if (valor.length < 2) { setResultados([]); return; }

    const { data } = await supabase
      .from('personas')
      .select('dpi, nombre, apellido1, apellido2, turnos(id, anio, comision, estado)')
      .like('dpi', `${valor}%`);

    if (data) {
      const dataOrdenada = data.map(persona => ({
        ...persona,
        turnos: persona.turnos.sort((a: any, b: any) => b.anio - a.anio)
      }));
      setResultados(dataOrdenada);
    }
  };

  const marcarComoComprado = async (turnoId: string, dpi: string, comision: string, anio: number) => {
    const { error } = await supabase.from('turnos').update({ estado: 'Comprado' }).eq('id', turnoId);
    if (!error) {
      await supabase.from('bitacora').insert({
        usuario: session.user.email,
        accion: 'Cobro de Turno',
        detalle: `DPI: ${dpi} - Comisión: ${comision} ${anio}`
      });
      setResultados(resultados.map(persona => {
        if (persona.dpi === dpi) {
          return { ...persona, turnos: persona.turnos.map((t: any) => t.id === turnoId ? { ...t, estado: 'Comprado' } : t) };
        }
        return persona;
      }));
    }
  };

  const procesarExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMensajeCarga('⏳ Leyendo archivo...');
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json(worksheet);

        const personasUnicas = new Map();
        const turnosNuevos = [];
        const anioActual = new Date().getFullYear(); // 2026

        for (const fila of filas as any[]) {
          if (!fila.DPI || !fila.Nombre || !fila.Anio) continue;
          
          const dpiStr = String(fila.DPI).trim();
          const anioTurno = Number(fila.Anio);
          
          // LÓGICA: Si el año es menor al actual (2026), ya está pagado.
          const estadoAsignado = anioTurno <= anioActual ? 'Comprado' : 'Pendiente';

          personasUnicas.set(dpiStr, {
            dpi: dpiStr,
            nombre: String(fila.Nombre).trim(),
            apellido1: fila.Apellido1 ? String(fila.Apellido1).trim() : '',
            apellido2: fila.Apellido2 ? String(fila.Apellido2).trim() : ''
          });

          turnosNuevos.push({
            persona_dpi: dpiStr,
            anio: anioTurno,
            comision: fila.Comision ? String(fila.Comision).trim() : 'General',
            estado: estadoAsignado
          });
        }

        await supabase.from('personas').upsert(Array.from(personasUnicas.values()), { onConflict: 'dpi', ignoreDuplicates: true });
        await supabase.from('turnos').upsert(turnosNuevos, { onConflict: 'persona_dpi,anio,comision', ignoreDuplicates: true });
        
        await supabase.from('bitacora').insert({
          usuario: session.user.email,
          accion: 'Carga Masiva',
          detalle: `Se procesaron ${turnosNuevos.length} registros.`
        });

        setMensajeCarga('✅ Carga exitosa. Historial y ventas futuras actualizadas.');
      } catch (err) { setMensajeCarga('❌ Error al procesar.'); }
    };
    reader.readAsBinaryString(file);
  };

  const isAdmin = session?.user?.email === correoAdmin;

  if (session) {
    return (
      <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2>⛪ Sistema de Turnos</h2>
          <button onClick={handleLogout} style={{ background: '#ff4444', color: 'white', border: 'none', borderRadius: '5px', padding: '5px 15px', cursor: 'pointer' }}>Salir</button>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button onClick={() => setVista('buscador')} style={{ flex: 1, padding: '10px', cursor: 'pointer', borderRadius: '5px', border: 'none', backgroundColor: vista === 'buscador' ? '#007bff' : '#ccc', color: 'white' }}>🔍 Buscar</button>
          {isAdmin && <button onClick={() => setVista('admin')} style={{ flex: 1, padding: '10px', cursor: 'pointer', borderRadius: '5px', border: 'none', backgroundColor: vista === 'admin' ? '#007bff' : '#ccc', color: 'white' }}>⚙️ Admin</button>}
        </div>

        {vista === 'buscador' ? (
          <div>
            <input type="text" placeholder="Buscar por DPI..." value={busqueda} onChange={manejarBusqueda} style={{ width: '100%', padding: '12px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ddd' }} />
            <div style={{ marginTop: '20px' }}>
              {resultados.map(p => (
                <div key={p.dpi} style={{ background: 'white', padding: '15px', border: '1px solid #eee', borderRadius: '10px', marginBottom: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                  <h3 style={{ margin: 0 }}>{p.nombre} {p.apellido1}</h3>
                  <p style={{ fontSize: '0.9em', color: '#666' }}>DPI: {p.dpi}</p>
                  {p.turnos.map((t: any) => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #f0f0f0', alignItems: 'center' }}>
                      <span><strong>{t.anio}</strong> - {t.comision}</span>
                      {t.estado === 'Pendiente' ? 
                        <button onClick={() => marcarComoComprado(t.id, p.dpi, t.comision, t.anio)} style={{ background: '#28a745', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Cobrar</button> : 
                        <span style={{ color: '#28a745', fontWeight: 'bold' }}>✅ Pagado</span>
                      }
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '10px', border: '1px solid #ddd' }}>
            <h3>Subir Archivo Excel</h3>
            <p style={{ fontSize: '0.8em', color: '#666' }}>Años anteriores a 2027 se marcan como "Pagado". 2027 en adelante como "Pendiente".</p>
            <input type="file" onChange={procesarExcel} />
            <p>{mensajeCarga}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '300px', margin: '100px auto', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h3>Iniciar Sesión</h3>
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input type="email" placeholder="Correo" onChange={e => setEmail(e.target.value)} required style={{ padding: '8px' }} />
        <input type="password" placeholder="Contraseña" onChange={e => setPassword(e.target.value)} required style={{ padding: '8px' }} />
        <button type="submit" style={{ padding: '10px', background: '#007bff', color: 'white', border: 'none', borderRadius: '5px' }}>Entrar</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}