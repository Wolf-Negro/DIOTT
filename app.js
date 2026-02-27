// ================= CONFIGURACIÓN =================
const APP_ID = '1616612773095470'; // Facebook
const SUPABASE_URL = 'https://nqjaynrdjejwnkfogpqu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_4gT8wKDrm1t-MrIkUxbLRw_mAfGAqot';

let ACCESS_TOKEN = '';
let FB_USER_ID = ''; 
let CLIENTES = [];
let cuentasBaseMeta = [];
let alertasGlobales = [];
const DEFAULT_TARGET_CPA = 5.00;

// Inicializar Facebook SDK
window.fbAsyncInit = function() {
    FB.init({ appId: APP_ID, cookie: true, xfbml: true, version: 'v19.0' });
};

(function(d, s, id){
    var js, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) {return;}
    js = d.createElement(s); js.id = id;
    js.src = "https://connect.facebook.net/es_LA/sdk.js";
    fjs.parentNode.insertBefore(js, fjs);
}(document, 'script', 'facebook-jssdk'));

document.addEventListener('DOMContentLoaded', () => {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    startDateInput.value = formattedDate;
    endDateInput.value = formattedDate;

    document.getElementById('btn-login').addEventListener('click', iniciarSesionFB);
    document.getElementById('btn-generate-dashboard').addEventListener('click', generarDashboard);
    
    document.getElementById('btn-edit-setup').addEventListener('click', () => {
        document.getElementById('dashboardGrid').classList.add('hidden');
        document.getElementById('btn-edit-setup').classList.add('hidden');
        document.getElementById('setupContainer').classList.remove('hidden');
        document.getElementById('alertPanel').classList.add('hidden');
        obtenerCuentas(); 
    });

    document.getElementById('searchAccountInput').addEventListener('input', function(e) {
        const text = e.target.value.toLowerCase();
        const items = document.querySelectorAll('.account-item');
        items.forEach(item => {
            const nameInput = item.querySelector('input[type="text"]');
            if (nameInput && nameInput.value.toLowerCase().includes(text)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    });

    const recargarSiEstaActivo = () => {
        if(startDateInput.value > endDateInput.value) return alert("Fecha inválida.");
        if(ACCESS_TOKEN !== '' && CLIENTES.length > 0 && !document.getElementById('dashboardGrid').classList.contains('hidden')) {
            cargarMetricas();
        }
    };

    startDateInput.addEventListener('change', recargarSiEstaActivo);
    endDateInput.addEventListener('change', recargarSiEstaActivo);
});

// ================= LÓGICA DE NUBE & LOGIN =================
function iniciarSesionFB() {
    const btnLogin = document.getElementById('btn-login');
    btnLogin.innerHTML = "Conectando con FB... ⏳";
    console.log("1. Solicitando acceso a Facebook...");

    // Quitamos el 'async' de aquí para que FB no colapse
    FB.login(function(response) {
        console.log("2. Respuesta de FB:", response);
        if (response.authResponse) {
            btnLogin.innerHTML = "Revisando la nube... ☁️";
            ACCESS_TOKEN = response.authResponse.accessToken;
            FB_USER_ID = response.authResponse.userID;
            
            // Llamamos a la función asíncrona de forma segura
            procesarConexionNube();
        } else {
            btnLogin.innerHTML = "Continuar con Facebook"; 
            console.log("El usuario canceló o el navegador bloqueó el popup.");
        }
    }, {scope: 'ads_read'});
}

async function procesarConexionNube() {
    try {
        console.log("3. Buscando en Supabase para el usuario:", FB_USER_ID);
        document.getElementById('loginContainer').classList.add('hidden');
        
        const datosNube = await cargarDeSupabase();
        
        if (datosNube) {
            console.log("4. ¡Datos encontrados en la nube!", datosNube);
            CLIENTES = datosNube.config_clientes;
            
            if(datosNube.agency_name) {
                document.getElementById('agencyNameInput').value = datosNube.agency_name;
                document.querySelector('header h1').innerHTML = `${datosNube.agency_name} <span class="beta-tag">SaaS BETA</span>`;
            }

            document.getElementById('dashboardGrid').classList.remove('hidden');
            document.getElementById('btn-edit-setup').classList.remove('hidden');
            
            dibujarTarjetas();
            cargarMetricas();
        } else {
            console.log("4. Usuario nuevo, mostrando panel de configuración.");
            document.getElementById('setupContainer').classList.remove('hidden');
            obtenerCuentas();
        }
    } catch (error) {
        console.error("Error crítico en la conexión con la nube:", error);
    }
}

// LECTURA DE SUPABASE
async function cargarDeSupabase() {
    const url = `${SUPABASE_URL}/rest/v1/agencias?fb_user_id=eq.${FB_USER_ID}&select=*`;
    try {
        const res = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        if (data && data.length > 0) return data[0]; 
    } catch(e) { console.error("Fallo al leer de Supabase:", e); }
    return null;
}

// ESCRITURA EN SUPABASE
async function guardarEnSupabase(agencyName, configClientes) {
    console.log("Guardando configuración en la nube...");
    const url = `${SUPABASE_URL}/rest/v1/agencias?fb_user_id=eq.${FB_USER_ID}`;
    const payload = {
        fb_user_id: FB_USER_ID,
        agency_name: agencyName,
        config_clientes: configClientes
    };

    try {
        const res = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        const data = await res.json();

        if (data && data.length > 0) {
            // Actualizar
            await fetch(url, {
                method: 'PATCH',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            console.log("¡Nube actualizada con éxito!");
        } else {
            // Insertar nuevo
            await fetch(`${SUPABASE_URL}/rest/v1/agencias`, {
                method: 'POST',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            console.log("¡Primera configuración guardada en la nube con éxito!");
        }
    } catch(e) { console.error("Fallo al guardar en Supabase:", e); }
}

// ================= FLUJO B2B =================
async function obtenerCuentas() {
    const url = `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,account_status&limit=100&access_token=${ACCESS_TOKEN}`;
    const listDOM = document.getElementById('accountsList');
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.data && data.data.length > 0) {
            cuentasBaseMeta = data.data;
            listDOM.innerHTML = '';
            
            cuentasBaseMeta.forEach(cuenta => {
                const nombreSeguro = cuenta.name ? cuenta.name.replace(/"/g, '&quot;') : `Cuenta ${cuenta.account_id}`;
                const clienteGuardado = CLIENTES.find(c => c.accountId === cuenta.id);
                const isChecked = clienteGuardado ? 'checked' : '';
                const nombreMostrar = clienteGuardado ? clienteGuardado.name : nombreSeguro;

                listDOM.innerHTML += `
                    <div class="account-item">
                        <input type="checkbox" id="chk-${cuenta.account_id}" ${isChecked}>
                        <input type="text" id="name-${cuenta.account_id}" value="${nombreMostrar}">
                    </div>`;
            });
        } else {
            listDOM.innerHTML = '<p>No se encontraron cuentas publicitarias.</p>';
        }
    } catch (e) { listDOM.innerHTML = '<p>Error de conexión con Meta.</p>'; }
}

function generarDashboard() {
    const agencyName = document.getElementById('agencyNameInput').value;
    if(agencyName.trim() !== '') {
        document.querySelector('header h1').innerHTML = `${agencyName} <span class="beta-tag">SaaS BETA</span>`;
    }

    CLIENTES = [];
    cuentasBaseMeta.forEach(cuenta => {
        const check = document.getElementById(`chk-${cuenta.account_id}`);
        if(check && check.checked) {
            CLIENTES.push({
                idDOM: `client-${cuenta.account_id}`,
                accountId: cuenta.id,
                name: document.getElementById(`name-${cuenta.account_id}`).value,
                status: cuenta.account_status,
                targetCPA: DEFAULT_TARGET_CPA
            });
        }
    });

    if(CLIENTES.length === 0) return alert("Debes seleccionar al menos una cuenta.");

    // MÁGIA DE NUBE: Guardamos todo en Supabase en segundo plano
    guardarEnSupabase(agencyName, CLIENTES);

    document.getElementById('setupContainer').classList.add('hidden');
    document.getElementById('dashboardGrid').classList.remove('hidden');
    document.getElementById('btn-edit-setup').classList.remove('hidden');
    
    dibujarTarjetas();
    cargarMetricas();
}

function dibujarTarjetas() {
    const grid = document.getElementById('dashboardGrid');
    grid.innerHTML = '';
    CLIENTES.forEach(c => {
        let badgeClass = 'status-warning';
        let badgeText = 'REVISIÓN/OTRO';
        
        if(c.status === 1) { badgeClass = 'status-active'; badgeText = 'ACTIVA'; }
        else if(c.status === 2) { badgeClass = 'status-error'; badgeText = 'INHABILITADA'; }
        else if(c.status === 3) { badgeClass = 'status-warning'; badgeText = 'ERROR PAGO'; }

        grid.innerHTML += `
            <div class="client-card" id="${c.idDOM}">
                <div class="card-header">
                    <h2>${c.name}</h2>
                    <span class="status-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="metrics">
                    <div class="metric"><span>Gasto</span><strong class="spend">S/ 0.00</strong></div>
                    <div class="metric"><span>Costo x <span class="lbl-tipo">Result.</span></span><strong class="cpa">S/ 0.00</strong></div>
                    <div class="metric"><span class="lbl-resultado">Resultados</span><strong class="results">0</strong></div>
                </div>
            </div>`;
    });
}

function extraerResultadoPrincipal(actions) {
    if (!actions) return { tipo: 'Resultados', tipoCorto: 'Result.', valor: 0 };
    
    const getVal = (type) => {
        const act = actions.find(a => a.action_type === type);
        return act ? parseFloat(act.value) : 0;
    };

    let compras = getVal('purchase') || getVal('offsite_conversion.fb_pixel_purchase');
    if (compras > 0) return { tipo: 'Compras', tipoCorto: 'Compra', valor: compras };

    let leads = getVal('lead') || getVal('offsite_conversion.fb_pixel_lead');
    if (leads > 0) return { tipo: 'Leads', tipoCorto: 'Lead', valor: leads };

    let mensajes = getVal('onsite_conversion.messaging_first_reply') 
                || getVal('onsite_conversion.messaging_conversation_started_7d')
                || getVal('messaging_conversation_started_7d');
                
    if (mensajes === 0) {
        const fallbackMsj = actions.find(a => a.action_type.includes('message'));
        if (fallbackMsj) mensajes = parseFloat(fallbackMsj.value);
    }
    
    if (mensajes > 0) return { tipo: 'Mensajes', tipoCorto: 'Msj', valor: mensajes };

    let clics = getVal('link_click');
    if (clics > 0) return { tipo: 'Clics', tipoCorto: 'Clic', valor: clics };

    return { tipo: 'Resultados', tipoCorto: 'Result.', valor: 0 };
}

async function cargarMetricas() {
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;
    const range = JSON.stringify({ since: start, until: end });
    
    alertasGlobales = [];
    document.getElementById('alertPanel').classList.add('hidden');
    document.getElementById('alertList').innerHTML = '';

    for (const c of CLIENTES) {
        const url = `https://graph.facebook.com/v19.0/${c.accountId}/insights?fields=spend,actions&time_range=${range}&access_token=${ACCESS_TOKEN}`;
        const card = document.getElementById(c.idDOM);
        
        card.querySelector('.spend').textContent = '...';
        card.querySelector('.cpa').textContent = '...';
        card.querySelector('.results').textContent = '...';

        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.data && data.data.length > 0) {
                const m = data.data[0];
                const gasto = parseFloat(m.spend || 0);
                
                const analisis = extraerResultadoPrincipal(m.actions);
                const resultados = analisis.valor;
                const cpa = resultados > 0 ? (gasto / resultados) : 0;

                if (cpa > c.targetCPA) {
                    alertasGlobales.push(`Costo Alto: ${c.name} está pagando S/ ${cpa.toFixed(2)} por ${analisis.tipoCorto}.`);
                }

                card.querySelector('.lbl-resultado').textContent = analisis.tipo;
                card.querySelector('.lbl-tipo').textContent = analisis.tipoCorto;
                
                card.querySelector('.spend').textContent = `S/ ${gasto.toFixed(2)}`;
                card.querySelector('.results').textContent = resultados;
                card.querySelector('.cpa').textContent = `S/ ${cpa.toFixed(2)}`;
            } else {
                card.querySelector('.spend').textContent = 'S/ 0.00';
                card.querySelector('.results').textContent = '0';
                card.querySelector('.cpa').textContent = 'S/ 0.00';
            }
        } catch (e) { console.error(e); }
    }

    if (alertasGlobales.length > 0) {
        const panel = document.getElementById('alertPanel');
        const list = document.getElementById('alertList');
        panel.classList.remove('hidden');
        alertasGlobales.forEach(alerta => {
            const li = document.createElement('li');
            li.textContent = alerta;
            list.appendChild(li);
        });
    }
}