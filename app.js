// ==========================================
// CONFIGURACIÓN SAAS
// ==========================================
const APP_ID = '1616612773095470'; 
let ACCESS_TOKEN = ''; 
let CLIENTES = []; 
let alertasGlobales = [];
const DEFAULT_TARGET_CPA = 5.00; 
let cuentasBaseMeta = [];

// 1. Inicializar el SDK de Facebook
window.fbAsyncInit = function() {
    FB.init({
        appId      : APP_ID,
        cookie     : true,
        xfbml      : true,
        version    : 'v19.0'
    });
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

    const actualizarFechas = () => {
        if(startDateInput.value > endDateInput.value) return alert("Fecha inválida.");
        // Solo recargar si ya pasamos el setup
        if(ACCESS_TOKEN !== '' && CLIENTES.length > 0) {
            cargarDatos(startDateInput.value, endDateInput.value);
        }
    };

    startDateInput.addEventListener('change', actualizarFechas);
    endDateInput.addEventListener('change', actualizarFechas);
});

// 2. Función de Inicio de Sesión
function iniciarSesionFB() {
    FB.login(function(response) {
        if (response.authResponse) {
            ACCESS_TOKEN = response.authResponse.accessToken;
            document.getElementById('loginContainer').classList.add('hidden');
            document.getElementById('setupContainer').classList.remove('hidden');
            obtenerCuentasDeAgencia();
        } else {
            alert('Cancelaste el inicio de sesión.');
        }
    }, {scope: 'ads_read'}); 
}

// 3. Obtener cuentas y mostrarlas en el SETUP
async function obtenerCuentasDeAgencia() {
    const url = `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,account_status&limit=50&access_token=${ACCESS_TOKEN}`;
    const listDOM = document.getElementById('accountsList');
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.data && data.data.length > 0) {
            cuentasBaseMeta = data.data;
            listDOM.innerHTML = ''; 

            cuentasBaseMeta.forEach(cuenta => {
                const nombreOriginal = cuenta.name || `Cuenta ${cuenta.account_id}`;
                listDOM.innerHTML += `
                    <div class="account-item">
                        <input type="checkbox" id="chk-${cuenta.account_id}" value="${cuenta.id}" checked>
                        <input type="text" id="name-${cuenta.account_id}" value="${nombreOriginal}" placeholder="Renombra este cliente">
                    </div>
                `;
            });
        } else {
            listDOM.innerHTML = '<p>No se encontraron cuentas publicitarias.</p>';
        }
    } catch (error) {
        listDOM.innerHTML = '<p>Error cargando cuentas.</p>';
    }
}

// 4. Generar Dashboard a medida
document.getElementById('btn-generate-dashboard').addEventListener('click', () => {
    const agencyName = document.getElementById('agencyNameInput').value;
    if(agencyName.trim() !== '') {
        document.querySelector('header h1').innerHTML = `${agencyName} <span class="beta-tag">SaaS BETA</span>`;
    }

    CLIENTES = [];
    cuentasBaseMeta.forEach(cuenta => {
        const checkbox = document.getElementById(`chk-${cuenta.account_id}`);
        if(checkbox && checkbox.checked) {
            const customName = document.getElementById(`name-${cuenta.account_id}`).value;
            CLIENTES.push({
                idDOM: `client-${cuenta.account_id}`,
                accountId: cuenta.id,
                name: customName || cuenta.name,
                status: cuenta.account_status,
                targetCPA: DEFAULT_TARGET_CPA
            });
        }
    });

    if(CLIENTES.length === 0) return alert("Debes seleccionar al menos una cuenta.");

    document.getElementById('setupContainer').classList.add('hidden');
    document.getElementById('dashboardGrid').classList.remove('hidden');

    construirTarjetasHTML();
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;
    cargarDatos(start, end);
});

// 5. Construir HTML de las tarjetas elegidas
function construirTarjetasHTML() {
    const grid = document.getElementById('dashboardGrid');
    grid.innerHTML = ''; 

    CLIENTES.forEach(cliente => {
        let badgeClass = 'status-warning';
        let badgeText = 'REVISIÓN/OTRO';
        
        if(cliente.status === 1) { badgeClass = 'status-active'; badgeText = 'ACTIVA'; }
        else if(cliente.status === 2) { badgeClass = 'status-error'; badgeText = 'INHABILITADA'; }
        else if(cliente.status === 3) { badgeClass = 'status-warning'; badgeText = 'ERROR DE PAGO'; }

        grid.innerHTML += `
            <div class="client-card" id="${cliente.idDOM}">
                <div class="card-header">
                    <h2>${cliente.name}</h2>
                    <span class="status-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="metrics">
                    <div class="metric"><span>Gasto</span><strong class="spend">Cargando...</strong></div>
                    <div class="metric"><span>Costo x Mensaje</span><strong class="cpa">Cargando...</strong></div>
                    <div class="metric"><span>Mensajes</span><strong class="results">...</strong></div>
                </div>
            </div>
        `;
    });
}

// 6. Cargar Métricas a las tarjetas activas
async function cargarDatos(fechaInicio, fechaFin) {
    const timeRange = JSON.stringify({ since: fechaInicio, until: fechaFin });
    alertasGlobales = [];
    document.getElementById('alertPanel').classList.add('hidden');
    document.getElementById('alertList').innerHTML = '';

    for (const cliente of CLIENTES) {
        const card = document.getElementById(cliente.idDOM);
        const urlMetrics = `https://graph.facebook.com/v19.0/${cliente.accountId}/insights?fields=spend,actions&time_range=${timeRange}&access_token=${ACCESS_TOKEN}`;

        try {
            const resMetrics = await fetch(urlMetrics);
            const dataMetrics = await resMetrics.json();

            if (dataMetrics.data && dataMetrics.data.length > 0) {
                const metricas = dataMetrics.data[0];
                const gasto = parseFloat(metricas.spend) || 0;
                
                let mensajes = 0;
                if (metricas.actions) {
                    const accionMensajes = metricas.actions.find(a => 
                        a.action_type.includes('messaging_conversation_started') || 
                        a.action_type.includes('messages')
                    );
                    if (accionMensajes) mensajes = parseFloat(accionMensajes.value);
                }

                let cpa = mensajes > 0 ? (gasto / mensajes) : 0;

                if (cpa > cliente.targetCPA) {
                    alertasGlobales.push(`CPA Alto en ${cliente.name}: S/ ${cpa.toFixed(2)}.`);
                }

                card.querySelector('.spend').textContent = `S/ ${parseFloat(gasto).toFixed(2)}`;
                card.querySelector('.cpa').textContent = `S/ ${parseFloat(cpa).toFixed(2)}`;
                card.querySelector('.results').textContent = mensajes;
            } else {
                card.querySelector('.spend').textContent = `S/ 0.00`;
                card.querySelector('.cpa').textContent = `S/ 0.00`;
                card.querySelector('.results').textContent = `0`;
            }
        } catch (error) {
            console.error("Error de conexión con " + cliente.name);
        }
    }
    
    // Dibujar alertas si hay
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