// ==========================================
// CONFIGURACIÓN SAAS
// ==========================================
const APP_ID = '1616612773095470'; // Tu identificador real
let ACCESS_TOKEN = ''; 
let CLIENTES = []; // Ahora la lista empieza vacía
let alertasGlobales = [];
const DEFAULT_TARGET_CPA = 5.00; 

// 1. Inicializar el SDK de Facebook
window.fbAsyncInit = function() {
    FB.init({
        appId      : APP_ID,
        cookie     : true,
        xfbml      : true,
        version    : 'v19.0'
    });
};

// Cargar el script de Meta de forma asíncrona
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

    // Escuchar el botón de Login
    document.getElementById('btn-login').addEventListener('click', iniciarSesionFB);

    const actualizarFechas = () => {
        if(startDateInput.value > endDateInput.value) return alert("Fecha inválida.");
        if(ACCESS_TOKEN !== '') cargarDatos(startDateInput.value, endDateInput.value);
    };

    startDateInput.addEventListener('change', actualizarFechas);
    endDateInput.addEventListener('change', actualizarFechas);
});

// 2. Función de Inicio de Sesión
function iniciarSesionFB() {
    FB.login(function(response) {
        if (response.authResponse) {
            ACCESS_TOKEN = response.authResponse.accessToken;
            document.getElementById('loginContainer').style.display = 'none';
            document.getElementById('dashboardGrid').style.display = 'grid';
            obtenerCuentasDeAgencia();
        } else {
            alert('Cancelaste el inicio de sesión o no diste permisos.');
        }
    }, {scope: 'ads_read'}); // Permiso obligatorio para leer anuncios
}

// 3. Obtener dinámicamente las cuentas publicitarias
async function obtenerCuentasDeAgencia() {
    const url = `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,account_status&limit=50&access_token=${ACCESS_TOKEN}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.data) {
            CLIENTES = data.data.map(cuenta => ({
                idDOM: `client-${cuenta.account_id}`,
                accountId: cuenta.id,
                name: cuenta.name || `Cuenta ${cuenta.account_id}`,
                status: cuenta.account_status,
                targetCPA: DEFAULT_TARGET_CPA
            }));
            
            construirTarjetasHTML();
            
            const start = document.getElementById('startDate').value;
            const end = document.getElementById('endDate').value;
            cargarDatos(start, end);
        }
    } catch (error) {
        console.error("Error obteniendo cuentas:", error);
    }
}

// 4. Construir las tarjetas en base a lo que devolvió Meta
function construirTarjetasHTML() {
    const grid = document.getElementById('dashboardGrid');
    grid.innerHTML = ''; 

    CLIENTES.forEach(cliente => {
        // Asignar etiqueta de estado inicial
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

// 5. Cargar las métricas de gasto y CPA
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
    
    // Dibujar alertas
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