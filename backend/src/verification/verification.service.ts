import { BadRequestException, ForbiddenException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';

const BUCKET = 'drive-kyc';
const MIME_EXTENSION: Record<string,string> = {
  'image/jpeg':'jpg', 'image/png':'png', 'application/pdf':'pdf',
};
const DRIVER_TYPES = ['license_front','license_back','national_id','vehicle_registration'];
const OWNER_TYPES = ['national_id','business_license','vehicle_registration','insurance'];

@Injectable()
export class VerificationService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}
  private db(token:string){ return this.database.userClient(token); }

  private async assertEligible(userId:string, token:string, role:string, type:'driver'|'owner', documentType:string, vehicleId?:string) {
    const db=this.db(token);
    if(type==='driver'){
      if(!DRIVER_TYPES.includes(documentType)) throw new BadRequestException('This document type is not valid for Driver verification.');
      if(role==='passenger'){
        const {data,error}=await db.from('driver_applications').select('status').eq('user_id',userId).maybeSingle();
        if(error||data?.status!=='pending') throw new ForbiddenException('Submit a Driver Partner application before uploading verification documents.');
      } else if(role!=='driver') throw new ForbiddenException('Only a Driver applicant can upload Driver verification documents.');
      return;
    }
    if(!OWNER_TYPES.includes(documentType)) throw new BadRequestException('This document type is not valid for Vehicle Owner verification.');
    if(role==='passenger'){
      const {data,error}=await db.from('vehicle_owner_applications').select('status').eq('user_id',userId).maybeSingle();
      if(error||data?.status!=='pending') throw new ForbiddenException('Submit a Vehicle Owner application before uploading verification documents.');
      if(vehicleId) throw new BadRequestException('A vehicle can only be linked after the Owner application is approved.');
    } else if(role==='vehicle_owner'){
      if(documentType==='vehicle_registration'&&!vehicleId) throw new BadRequestException('Select the vehicle for its registration document.');
      if(vehicleId){
        const {data,error}=await db.from('vehicles').select('id').eq('id',vehicleId).eq('owner_id',userId).maybeSingle();
        if(error||!data) throw new ForbiddenException('The selected vehicle does not belong to this account.');
      }
    } else throw new ForbiddenException('Only a Vehicle Owner applicant can upload Owner verification documents.');
  }

  async createUploadUrl(userId:string, token:string, role:string, input:any) {
    await this.assertEligible(userId,token,role,input.applicationType,input.documentType,input.vehicleId);
    const extension=MIME_EXTENSION[input.contentType];
    if(!extension) throw new BadRequestException('Only JPG, PNG and PDF documents are accepted.');
    if(input.size>10*1024*1024) throw new BadRequestException('Each verification file must be 10 MB or smaller.');
    const path=userId+'/'+input.applicationType+'/'+input.documentType+'/'+randomUUID()+'.'+extension;
    const {data,error}=await this.db(token).storage.from(BUCKET).createSignedUploadUrl(path);
    if(error||!data?.signedUrl||!data?.token) throw new ServiceUnavailableException(error?.message||'Could not create a secure upload URL.');
    return {path:data.path||path,signedUrl:data.signedUrl,token:data.token,expiresInSeconds:120,contentType:input.contentType};
  }

  async registerDocument(userId:string,token:string,role:string,input:any) {
    await this.assertEligible(userId,token,role,input.applicationType,input.documentType,input.vehicleId);
    const prefix=userId+'/'+input.applicationType+'/'+input.documentType+'/';
    if(!input.storagePath.startsWith(prefix)||input.storagePath.includes('..')) throw new ForbiddenException('The uploaded file path is not valid for this account.');
    const parts=input.storagePath.split('/');
    const fileName=parts[parts.length-1];
    const folder=parts.slice(0,-1).join('/');
    const {data:files,error:listError}=await this.db(token).storage.from(BUCKET).list(folder,{search:fileName,limit:10});
    if(listError||!files?.some((file:any)=>file.name===fileName)) throw new BadRequestException('The uploaded file was not found. Upload it before submitting the document.');
    if(input.applicationType==='driver'){
      const {data,error}=await this.db(token).from('driver_documents').insert({
        driver_id:userId,document_type:input.documentType,storage_path:input.storagePath,
      }).select('*').single();
      if(error||!data) throw new BadRequestException(error?.message||'Driver document could not be registered.');
      return {message:'Document uploaded and submitted for review.',document:data};
    }
    const {data,error}=await this.db(token).from('owner_documents').insert({
      owner_id:userId,vehicle_id:input.vehicleId||null,document_type:input.documentType,storage_path:input.storagePath,
    }).select('*').single();
    if(error||!data) throw new BadRequestException(error?.message||'Owner document could not be registered.');
    return {message:'Document uploaded and submitted for review.',document:data};
  }

  async listMine(userId:string,token:string) {
    const db=this.db(token);
    const [driver,owner]=await Promise.all([
      db.from('driver_documents').select('*').eq('driver_id',userId).order('created_at',{ascending:false}),
      db.from('owner_documents').select('*').eq('owner_id',userId).order('created_at',{ascending:false}),
    ]);
    if(driver.error||owner.error) throw new ServiceUnavailableException(driver.error?.message||owner.error?.message);
    return {driverDocuments:driver.data||[],ownerDocuments:owner.data||[]};
  }

  async listForAdmin(token:string,type:'driver'|'owner') {
    const db=this.db(token);
    const table=type==='driver'?'driver_documents':'owner_documents';
    const ownerField=type==='driver'?'driver_id':'owner_id';
    const {data,error}=await db.from(table).select('*').order('created_at',{ascending:false}).limit(200);
    if(error) throw new ServiceUnavailableException(error.message);
    const rows=data||[];
    const ids=[...new Set(rows.map((row:any)=>row[ownerField]))];
    const {data:profiles,error:profileError}=ids.length
      ?await db.from('profiles').select('id,full_name,phone').in('id',ids)
      :{data:[],error:null};
    if(profileError) throw new ServiceUnavailableException(profileError.message);
    const profileMap=new Map((profiles||[]).map((p:any)=>[p.id,p]));
    return Promise.all(rows.map(async(row:any)=>{
      const {data:signed,error:signedError}=await db.storage.from(BUCKET).createSignedUrl(row.storage_path,300);
      return {...row,profile:profileMap.get(row[ownerField])||null,previewUrl:signedError?null:signed?.signedUrl||null};
    }));
  }

  async review(token:string,type:'driver'|'owner',id:string,input:any,adminId:string) {
    if(input.status==='rejected'&&!input.rejectionReason?.trim()) throw new BadRequestException('A reason is required when rejecting a document.');
    const table=type==='driver'?'driver_documents':'owner_documents';
    const ownerField=type==='driver'?'driver_id':'owner_id';
    const {data,error}=await this.db(token).from(table).update({
      verification_status:input.status,
      reviewer_id:adminId,
      reviewed_at:new Date().toISOString(),
      rejection_reason:input.status==='rejected'?input.rejectionReason.trim():null,
    }).eq('id',id).eq('verification_status','pending').select('*').maybeSingle();
    if(error||!data) throw new BadRequestException(error?.message||'Pending document not found or already reviewed.');
    return {message:'Verification document '+input.status+'.',document:data,ownerId:data[ownerField]};
  }
}
