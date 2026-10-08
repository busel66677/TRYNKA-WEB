/* Shared safety check: k6 must never point at the live TRYNKA database.
   Pure ES module also tested with Node. */
export const PRODUCTION_PROJECT_REF='oqyjypzltncbruzaxetp';

export function requireStagingSupabaseUrl(value,confirmation){
  if(typeof value!=='string')throw new Error('STAGING_SUPABASE_URL is required');
  const clean=value.trim().toLowerCase();
  const match=clean.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/);
  if(!match)throw new Error('Only a dedicated HTTPS Supabase staging project is allowed');
  if(match[1]===PRODUCTION_PROJECT_REF)
    throw new Error('Production Supabase project is forbidden for load tests');
  if(confirmation!=='STAGING_ONLY_I_ACCEPT_THE_TEST_LOAD')
    throw new Error('Set STAGING_CONFIRM=STAGING_ONLY_I_ACCEPT_THE_TEST_LOAD');
  return 'https://'+match[1]+'.supabase.co';
}
export function requireVirtualUsers(value){
  const n=Number(value);
  if(!Number.isInteger(n)||n<1||n>150)
    throw new Error('LOAD_VUS must be an integer from 1 to 150');
  return n;
}
