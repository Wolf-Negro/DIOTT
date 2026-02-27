const APP_ID = '1616612773095470';
let ACCESS_TOKEN = '';
let CLIENTES = [];
let cuentasBaseMeta = [];

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
    document.getElementById('btn-login').addEventListener('click', iniciarSesionFB);
    document.getElementById('btn-generate-dashboard').addEventListener('click', generarDashboard);
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
        if (data.data) {
            cuentasBaseMeta = data.data;
            listDOM.innerHTML = '';
            cuentasBaseMeta.forEach(cuenta => {
                listDOM.innerHTML += `
                    <div class="account-item">
                        <input type="checkbox" id="chk-${cuenta.account_id}" checked>
                        <input type="text" id="name-${cuenta.account_id}" value="${cuenta.name}">
                    </div>`;
            });
        }
    } catch (e) { console.error(e); }
}

function generarDashboard() {
    const agencyName = document.getElementById('agencyNameInput').value;
    if(agencyName) document.querySelector('header h1').textContent = agencyName;

    CLIENTES = [];
    cuentasBaseMeta.forEach(cuenta => {
        if(document.getElementById(`chk-${cuenta.account_id}`).checked) {
            CLIENTES.push({
                idDOM: `client-${cuenta.account_id}`,
                accountId: cuenta.id,
                name: document.getElementById(`name-${cuenta.account_id}`).value,
                status: cuenta.account_status
            });
        }
    });

    document.getElementById('setupContainer').classList.add('hidden');
    document.getElementById('dashboardGrid').classList.remove('hidden');
    
    dibujarTarjetas();
    cargarMetricas();
}

function dibujarTarjetas() {
    const grid = document.getElementById('dashboardGrid');
    grid.innerHTML = '';
    CLIENTES.forEach(c => {
        grid.innerHTML += `
            <div class="client-card" id="${c.idDOM}">
                <div class="card-header">
                    <h2>${c.name}</h2>
                    <span class="status-badge ${c.status === 1 ? 'status-active' : 'status-error'}">${c.status === 1 ? 'ACTIVA' : 'REVISIÓN'}</span>
                </div>
                <div class="metrics">
                    <div class="metric"><span>Gasto</span><strong class="spend">S/ 0.00</strong></div>
                    <div class="metric"><span>CPA</span><strong class="cpa">S/ 0.00</strong></div>
                    <div class="metric"><span>Mensajes</span><strong class="results">0</strong></div>
                </div>
            </div>`;
    });
}

async function cargarMetricas() {
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;
    const range = JSON.stringify({ since: start, until: end });

    for (const c of CLIENTES) {
        const url = `https://graph.facebook.com/v19.0/${c.accountId}/insights?fields=spend,actions&time_range=${range}&access_token=${ACCESS_TOKEN}`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.data && data.data.length > 0) {
                const m = data.data[0];
                const gasto = parseFloat(m.spend);
                const msj = m.actions ? (m.actions.find(a => a.action_type.includes('message'))?.value || 0) : 0;
                const card = document.getElementById(c.idDOM);
                card.querySelector('.spend').textContent = `S/ ${gasto.toFixed(2)}`;
                card.querySelector('.results').textContent = msj;
                card.querySelector('.cpa').textContent = `S/ ${msj > 0 ? (gasto/msj).toFixed(2) : '0.00'}`;
            }
        } catch (e) { console.error(e); }
    }
}