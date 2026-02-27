const APP_ID = '1616612773095470';
let ACCESS_TOKEN = '';
let CLIENTES = [];
let cuentasBaseMeta = [];
let alertasGlobales = [];
const DEFAULT_TARGET_CPA = 5.00;

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
    });

    // LÓGICA DEL BUSCADOR DE CUENTAS
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

function iniciarSesionFB() {
    FB.login(function(response) {
        if (response.authResponse) {
            ACCESS_TOKEN = response.authResponse.accessToken;
            document.getElementById('loginContainer').classList.add('hidden');
            document.getElementById('setupContainer').classList.remove('hidden');
            obtenerCuentas();
        }
    }, {scope: 'ads_read'});
}

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
                listDOM.innerHTML += `
                    <div class="account-item">
                        <input type="checkbox" id="chk-${cuenta.account_id}">
                        <input type="text" id="name-${cuenta.account_id}" value="${nombreSeguro}">
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

// NUEVA INTELIGENCIA: EXTRACCIÓN EXACTA, SIN SUMAS DOBLES
function extraerResultadoPrincipal(actions) {
    if (!actions) return { tipo: 'Resultados', tipoCorto: 'Result.', valor: 0 };
    
    // Función para sacar el valor de una métrica sin sumar repetidos
    const getVal = (type) => {
        const act = actions.find(a => a.action_type === type);
        return act ? parseFloat(act.value) : 0;
    };

    // 1. Prioridad: Compras
    let compras = getVal('purchase') || getVal('offsite_conversion.fb_pixel_purchase');
    if (compras > 0) return { tipo: 'Compras', tipoCorto: 'Compra', valor: compras };

    // 2. Prioridad: Leads
    let leads = getVal('lead') || getVal('offsite_conversion.fb_pixel_lead');
    if (leads > 0) return { tipo: 'Leads', tipoCorto: 'Lead', valor: leads };

    // 3. Prioridad: Mensajes (Se toma el principal, NO se suman para evitar inflación)
    let mensajes = getVal('onsite_conversion.messaging_first_reply') 
                || getVal('onsite_conversion.messaging_conversation_started_7d')
                || getVal('messaging_conversation_started_7d');
                
    if (mensajes === 0) {
        const fallbackMsj = actions.find(a => a.action_type.includes('message'));
        if (fallbackMsj) mensajes = parseFloat(fallbackMsj.value);
    }
    
    if (mensajes > 0) return { tipo: 'Mensajes', tipoCorto: 'Msj', valor: mensajes };

    // 4. Fallback: Clics en el enlace
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