import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import * as XLSX from 'xlsx';

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<any>(null);
  const [error, setError] = useState('');

  // 👇 CONFIGURA TUS ACCESOS AQUÍ 👇
  const correoAdmin = 'admin@comisiones.com'; 
  const cajerosJesus = ['lsaenz@comisiones.com', 'ngomez@comisiones.com', 'ccasia@comisiones.com','kcaballeros@comisiones.com']; 
  const cajerosVirgen = ['cajero2@ejemplo.com', 'ana@ejemplo.com']; 

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

  // 🧠 Lógica para saber qué permisos tiene el usuario conectado
  const userEmail = session?.user?.email;
  const isAdmin = userEmail === correoAdmin;
  const veJesus = isAdmin || cajerosJesus.includes(userEmail);
  const veVirgen = isAdmin || cajerosVirgen.includes(userEmail);

  const manejarBusqueda = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value;
    setBusqueda(valor);
    if (valor.length < 2) { setResultados([]); return; }

    const { data } = await supabase
      .from('personas')
      // Ahora traemos también la columna 'imagen'
      .select('dpi, nombre, apellido1, apellido2, turnos(id, anio, comision, estado, imagen)')
      .like('dpi', `${valor}%`);

    if (data) {
      const dataFiltrada = data.map(persona => {
        // Filtramos los turnos según los permisos del usuario que está cobrando
        const turnosPermitidos = persona.turnos.filter((t: any) => {
          if (t.imagen === 'Jesús' && !veJesus) return false;
          if (t.imagen === 'Virgen' && !veVirgen) return false;
          return true; // Si es 'General' o tiene permisos, lo deja ver
        });

        return {
          ...persona,
          turnos: turnosPermitidos.sort((a: any, b: any) => b.anio - a.anio)
        };
      });
      setResultados(dataFiltrada);
    }
  };

  const marcarComoComprado = async (turnoId: string, dpi: string, comision: string, anio: number) => {
    const { error } = await supabase.from('turnos').update({ estado: 'Validado' }).eq('id', turnoId);
    if (!error) {
      await supabase.from('bitacora').insert({
        usuario: userEmail,
        accion: 'Cobro de Turno',
        detalle: `DPI: ${dpi} - Comisión: ${comision} ${anio}`
      });
      setResultados(resultados.map(persona => {
        if (persona.dpi === dpi) {
          return { ...persona, turnos: persona.turnos.map((t: any) => t.id === turnoId ? { ...t, estado: 'Validado' } : t) };
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
        const anioActual = new Date().getFullYear(); 

        for (const fila of filas as any[]) {
          if (!fila.DPI || !fila.Nombre || !fila.Anio) continue;
          
          const dpiStr = String(fila.DPI).trim();
          const anioTurno = Number(fila.Anio);
          const estadoAsignado = anioTurno <= anioActual ? 'Validado' : 'Pendiente';
          const imagenAsignada = fila.Imagen ? String(fila.Imagen).trim() : 'General'; // Lee la columna Imagen

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
            estado: estadoAsignado,
            imagen: imagenAsignada
          });
        }

        await supabase.from('personas').upsert(Array.from(personasUnicas.values()), { onConflict: 'dpi', ignoreDuplicates: true });
        
        // Actualizamos el candado en la subida para que coincida con la BD
        await supabase.from('turnos').upsert(turnosNuevos, { onConflict: 'persona_dpi,anio,comision,imagen', ignoreDuplicates: true });
        
        await supabase.from('bitacora').insert({
          usuario: userEmail,
          accion: 'Carga Masiva',
          detalle: `Se procesaron ${turnosNuevos.length} registros.`
        });

        setMensajeCarga('✅ Carga exitosa con separación por Imagen.');
      } catch (err) { setMensajeCarga('❌ Error al procesar. Verifica que la columna "Anio" y "Imagen" existan.'); }
    };
    reader.readAsBinaryString(file);
  };

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
                p.turnos.length > 0 && (
                  <div key={p.dpi} style={{ background: 'white', padding: '15px', border: '1px solid #eee', borderRadius: '10px', marginBottom: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ margin: 0 }}>{p.nombre} {p.apellido1}</h3>
                    <p style={{ fontSize: '0.9em', color: '#666' }}>DPI: {p.dpi}</p>
                    {p.turnos.map((t: any) => (
                      <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #f0f0f0', alignItems: 'center' }}>
                        <span>
                          <strong>{t.anio}</strong> - {t.comision} 
                          <span style={{ fontSize: '0.8em', marginLeft: '10px', padding: '2px 6px', background: t.imagen === 'Jesús' ? '#e3f2fd' : '#fce4ec', color: t.imagen === 'Jesús' ? '#1565c0' : '#c2185b', borderRadius: '4px' }}>
                            {t.imagen}
                          </span>
                        </span>
                        {t.estado === 'Pendiente' ? 
                          <button onClick={() => marcarComoComprado(t.id, p.dpi, t.comision, t.anio)} style={{ background: '#28a745', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Cobrar</button> : 
                          <span style={{ color: '#28a745', fontWeight: 'bold' }}>✅ Validado</span>
                        }
                      </div>
                    ))}
                  </div>
                )
              ))}
              {resultados.length > 0 && resultados.every(p => p.turnos.length === 0) && (
                <p style={{ textAlign: 'center', color: '#666' }}>No hay turnos disponibles para tu usuario.</p>
              )}
            </div>
          </div>
        ) : (
          <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '10px', border: '1px solid #ddd' }}>
            <h3>Subir Archivo Excel</h3>
            <p style={{ fontSize: '0.8em', color: '#666' }}>Recuerda incluir la columna <strong>"Imagen"</strong> (valores: Jesús o Virgen).</p>
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