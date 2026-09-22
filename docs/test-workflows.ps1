param([string]$BaseUrl = 'http://localhost:3000/api')
$ErrorActionPreference = 'Stop'
if (([uri]$BaseUrl).Host -eq 'assethub-backend.vercel.app') { throw 'Use a disposable local/staging database for this workflow test.' }
try {
  $null = Invoke-RestMethod -Uri (([uri]$BaseUrl).GetLeftPart([System.UriPartial]::Authority) + '/health') -TimeoutSec 5
} catch {
  throw 'Cannot reach the API. In another terminal, set a real TEST_DATABASE_URL and run npm.cmd run test:server. Wait for the ready message, then retry.'
}
$login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType 'application/json' -Body (@{email='admin@assethub.local';password='Admin@123'} | ConvertTo-Json)
$headers = @{Authorization="Bearer $($login.data.accessToken)"}
function Api([string]$Method, [string]$Path, $Body) {
  $parameters = @{Method=$Method;Uri="$BaseUrl$Path";Headers=$headers;ContentType='application/json'}
  if ($null -ne $Body) { $parameters.Body = $Body | ConvertTo-Json -Depth 8 }
  (Invoke-RestMethod @parameters).data
}
$suffix = [guid]::NewGuid().ToString('N')
$category = Api POST '/categories' @{name='Workflow category';code="CAT-$suffix"}
$location = Api POST '/locations' @{name='Workflow campus';code="LOC-$suffix";type='campus'}
$destination = Api POST '/locations' @{name='Workflow room';code="ROOM-$suffix";type='room';parentId=$location.id}
$asset = Api POST '/assets' @{name='Workflow laptop';assetTag="ASSET-$suffix";categoryId=$category.id;locationId=$location.id}
$null = Api PUT "/assets/$($asset.id)" @{name='Updated workflow laptop';condition='GOOD'}
$transfer = Api POST '/transfers' @{assetId=$asset.id;toLocationId=$destination.id;reason='Workflow test'}
$updated = Api GET "/assets/$($asset.id)" $null
if ($updated.locationId -ne $destination.id) { throw 'Asset location did not change' }
$history = Api GET "/assets/$($asset.id)/history" $null
if (-not ($history | Where-Object type -eq 'transfer')) { throw 'Transfer history missing' }
$me = Api GET '/auth/me' $null
$custody = Api POST '/custody-assignments' @{assetId=$asset.id;userId=$me.id;notes='Issued'}
$null = Api PUT "/custody-assignments/$($custody.id)" @{returnedAt=[DateTime]::UtcNow.ToString('o');notes='Returned'}
$supplier = Api POST '/suppliers' @{name='Workflow supplier'}
$order = Api POST '/purchase-orders' @{orderNumber="PO-$suffix";supplierId=$supplier.id;assetId=$asset.id;totalAmount=1000}
$invoice = Api POST '/invoices' @{invoiceNumber="INV-$suffix";purchaseOrderId=$order.id;amount=1000;issueDate=[DateTime]::UtcNow.ToString('o')}
$template = Api POST '/maintenance-templates' @{name='Inspection';categoryId=$category.id;triggerType='TIME_BASED';frequencyDays=30;tasks=@('Check cables')}
$workOrder = Api POST '/work-orders' @{assetId=$asset.id;templateId=$template.id;title='Workflow inspection';assignedToUserId=$me.id}
$null = Api PUT "/work-orders/$($workOrder.id)" @{status='ASSIGNED'}
$null = Api PUT "/work-orders/$($workOrder.id)" @{status='IN_PROGRESS'}
$completed = Api PUT "/work-orders/$($workOrder.id)/complete" @{laborCost=100;partsCost=50;downtimeHours=2;outcome='Fixed'}
if ($completed.status -ne 'COMPLETED' -or -not $completed.completedAt) { throw 'Work order did not complete' }
$event = Api POST '/service-events' @{workOrderId=$workOrder.id;laborCost=5;partsCost=0;notes='Follow-up'}
[pscustomobject]@{AssetId=$asset.id;TransferId=$transfer.id;InvoiceId=$invoice.id;WorkOrderId=$workOrder.id;ServiceEventId=$event.id;Result='Workflows passed'}
