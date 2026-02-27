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
    
    // Botón para volver a editar cuentas
    document.getElementById('btn-edit-setup').addEventListener('click', () => {
        document.getElementById('dashboardGrid').classList.add('hidden');
        document.getElementById('btn-edit-setup').classList.add('hidden');
        document.getElementById('setupContainer').classList.remove('hidden');
        document.getElementById('alertPanel').classList.add('hidden');
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
    const url = `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,account_status&limit=50&access_token=${ACCESS_TOKEN}`;
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
                        <input type="text" id="name-${cuenta.account_id}" value="${nombreSeguro}" placeholder="Renombra este cliente">
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
    document.getElementById('btn-edit-setup').classList.remove('hidden'); // Mostrar botón de editar
    
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

// INTELIGENCIA PARA DETECTAR EL OBJETIVO REAL DE LA CAMPAÑA
function extraerResultadoPrincipal(actions) {
    if (!actions) return { tipo: 'Resultados', valor: 0 };
    
    // Jerarquía de valor: 1. Compras, 2. Leads, 3. Mensajes, 4. Clics
    const prioridades = [
        { keys: ['purchase'], nombre: 'Compras', nombreCorto: 'Compra' },
        { keys: ['lead'], nombre: 'Leads', nombreCorto: 'Lead' },
        { keys: ['onsite_conversion.messaging_conversation_started_7d', 'messaging_conversation_started_7d', 'messages', 'onsite_conversion.messaging_first_reply'], nombre: 'Mensajes', nombreCorto: 'Msj' },
        { keys: ['link_click'], nombre: 'Clics', nombreCorto: 'Clic' }
    ];

    for (let p of prioridades) {
        let total = 0;
        for (let a of actions) {
            if (p.keys.some(k => a.action_type.includes(k))) {
                total += parseFloat(a.value);
            }
        }
        if (total > 0) return { tipo: p.nombre, tipoCorto: p.nombreCorto, valor: total };
    }
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
                
                // Aplicar la inteligencia artificial de detección
                const analisis = extraerResultadoPrincipal(m.actions);
                const resultados = analisis.valor;
                const cpa = resultados > 0 ? (gasto/resultados) : 0;

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